import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from pydantic import ValidationError

from talentpulse_ai.agent_foundation.approval import (
    ApprovalDecision,
    ApprovalErrorCode,
    ApprovalStatus,
    ApprovalValidationError,
    approval_state_payload,
    build_approval_graph,
    create_approval_request,
    validate_approval_decision,
)


class FakeActionExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def execute(self, request, *, idempotency_key: str) -> str:
        self.calls.append((request.operation_ref, idempotency_key))
        return f"result:{request.operation_ref}"


def make_request(*, now: datetime | None = None):
    return create_approval_request(
        approval_id=uuid4(),
        operation_ref="operation-42",
        resource_ref="cv-ref-9",
        expected_version="cv-version-3",
        action_code="PUBLISH_CV",
        now=now or datetime(2026, 11, 17, 10, 0, tzinfo=UTC),
    )


def make_decision(request, decision: str = "APPROVE") -> ApprovalDecision:
    return ApprovalDecision(
        approval_id=request.approval_id,
        decision=decision,
        decision_id=uuid4(),
        operation_ref=request.operation_ref,
        expected_version=request.expected_version,
    )


def test_approval_expiry_is_fixed_at_creation_for_exactly_24_hours() -> None:
    now = datetime(2026, 11, 17, 10, 0, tzinfo=UTC)

    request = make_request(now=now)

    assert request.created_at == now
    assert request.expires_at == now + timedelta(hours=24)


def test_approval_request_rejects_naive_or_arbitrary_expiry() -> None:
    request = make_request()
    raw = request.model_dump(mode="python")

    with pytest.raises(ValidationError):
        type(request).model_validate(
            {**raw, "expires_at": datetime(2026, 11, 18, 10, 0)}
        )
    with pytest.raises(ValidationError):
        type(request).model_validate(
            {**raw, "expires_at": request.expires_at + timedelta(days=1)}
        )


def test_approval_request_rejects_cv_text_prompt_and_extra_fields() -> None:
    request = make_request()
    raw = request.model_dump(mode="python")
    raw["cv_text"] = "PRIVATE_CV_MARKER"
    raw["prompt"] = "PRIVATE_PROMPT_MARKER"

    with pytest.raises(ValidationError):
        type(request).model_validate(raw)

    with pytest.raises(ValidationError):
        type(request).model_validate(
            {
                **request.model_dump(mode="python"),
                "resource_ref": "candidate cv text",
            }
        )


def test_approval_decision_requires_matching_pending_operation_and_version() -> None:
    request = make_request()
    decision = make_decision(request)

    validate_approval_decision(request, decision, now=request.created_at)

    stale = decision.model_copy(update={"expected_version": "cv-version-old"})
    with pytest.raises(ApprovalValidationError) as error:
        validate_approval_decision(request, stale, now=request.created_at)
    assert error.value.code is ApprovalErrorCode.STALE_VERSION


def test_expired_and_duplicate_approval_decisions_are_rejected() -> None:
    request = make_request()
    decision = make_decision(request)

    with pytest.raises(ApprovalValidationError) as expired:
        validate_approval_decision(request, decision, now=request.expires_at)
    assert expired.value.code is ApprovalErrorCode.EXPIRED

    with pytest.raises(ApprovalValidationError) as duplicate:
        validate_approval_decision(
            request,
            decision,
            now=request.created_at,
            consumed_decision_ids=frozenset({decision.decision_id}),
        )
    assert duplicate.value.code is ApprovalErrorCode.DUPLICATE_DECISION


def test_serialized_approval_state_contains_only_reference_metadata() -> None:
    request = make_request()
    payload = approval_state_payload(
        {
            "approval": request,
            "status": ApprovalStatus.PENDING,
        }
    )
    serialized = json.dumps(payload, sort_keys=True)

    assert set(payload) == {"approval", "status"}
    for marker in (
        "PRIVATE_CV_MARKER",
        "PRIVATE_PROMPT_MARKER",
        "PRIVATE_MODEL_OUTPUT_MARKER",
        "PRIVATE_CREDENTIAL_MARKER",
    ):
        assert marker not in serialized

    with pytest.raises(ValueError):
        approval_state_payload(
            {"approval": request, "status": ApprovalStatus.PENDING, "prompt": "untrusted"}
        )


def test_approval_graph_pauses_before_action_and_uses_idempotency_key_after_approval() -> None:
    request = make_request()
    action = FakeActionExecutor()
    graph = build_approval_graph(InMemorySaver(), {"PUBLISH_CV": action})
    config = {
        "configurable": {"thread_id": str(request.approval_id)},
        "metadata": {"agent_approval_expires_at": request.expires_at.isoformat()},
    }

    pending = graph.invoke(
        {
            "approval": request.model_dump(mode="json"),
            "status": ApprovalStatus.PENDING.value,
        },
        config=config,
    )

    assert pending["status"] == ApprovalStatus.PENDING.value
    assert action.calls == []

    decision = make_decision(request)
    completed = graph.invoke(
        Command(resume=decision.model_dump(mode="json")),
        config=config,
    )

    assert completed["status"] == ApprovalStatus.COMPLETE.value
    assert action.calls == [
        ("operation-42", f"agent-approval:{request.approval_id}:{decision.decision_id}")
    ]


def test_rejected_approval_never_calls_owner_action() -> None:
    request = make_request()
    action = FakeActionExecutor()
    graph = build_approval_graph(InMemorySaver(), {"PUBLISH_CV": action})
    config = {"configurable": {"thread_id": str(request.approval_id)}}
    graph.invoke(
        {
            "approval": request.model_dump(mode="json"),
            "status": ApprovalStatus.PENDING.value,
        },
        config=config,
    )

    rejected = graph.invoke(
        Command(resume=make_decision(request, "REJECT").model_dump(mode="json")),
        config=config,
    )

    assert rejected["status"] == ApprovalStatus.REJECTED.value
    assert action.calls == []
