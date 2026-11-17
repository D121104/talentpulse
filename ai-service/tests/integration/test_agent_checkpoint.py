import json
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from talentpulse_ai.agent_foundation.approval import (
    ApprovalDecision,
    ApprovalErrorCode,
    ApprovalManager,
    ApprovalStatus,
    ApprovalValidationError,
    create_approval_request,
)
from talentpulse_ai.infrastructure.agent_checkpointer import AgentCheckpointer


class FakeOwnerAction:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def execute(self, request, *, idempotency_key: str) -> str:
        self.calls.append((request.operation_ref, idempotency_key))
        return f"owner-result:{request.operation_ref}"


@pytest.fixture
def database_url() -> str:
    database_url = os.environ.get("AGENT_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("AGENT_TEST_DATABASE_URL must point to a dedicated migrated test database")
    return database_url


def make_request(*, now: datetime | None = None):
    return create_approval_request(
        approval_id=uuid4(),
        operation_ref="test-operation",
        resource_ref="synthetic-resource",
        expected_version="version-1",
        action_code="SYNTHETIC_ACTION",
        now=now or datetime.now(UTC),
    )


def make_decision(request, *, decision: str = "APPROVE", version: str | None = None):
    return ApprovalDecision(
        approval_id=request.approval_id,
        decision=decision,
        decision_id=uuid4(),
        operation_ref=request.operation_ref,
        expected_version=version or request.expected_version,
    )


def test_postgres_checkpoint_resumes_same_thread_after_manager_recreation(
    database_url: str,
) -> None:
    request = make_request()
    action = FakeOwnerAction()
    checkpointer_before_restart = AgentCheckpointer(database_url)
    checkpointer_before_restart.open()
    try:
        manager_before_restart = ApprovalManager(
            checkpointer_before_restart,
            {"SYNTHETIC_ACTION": action},
            can_start_approval=lambda _request: True,
        )
        pending = manager_before_restart.start(request)
        assert pending.status is ApprovalStatus.PENDING
        assert action.calls == []
        checkpoint = checkpointer_before_restart.get_checkpoint(request.approval_id)
        assert checkpoint is not None
        approval_state = checkpoint.checkpoint["channel_values"]["approval"]
        assert isinstance(approval_state, dict)
        assert set(approval_state) == set(request.model_dump(mode="json"))
        checkpoint_data = json.dumps(checkpoint.checkpoint, default=str)
        assert "cv_text" not in checkpoint_data
        assert "prompt" not in checkpoint_data
        assert "credentials" not in checkpoint_data
    finally:
        checkpointer_before_restart.close()

    checkpointer_after_restart = AgentCheckpointer(database_url)
    checkpointer_after_restart.open()
    try:
        manager_after_restart = ApprovalManager(
            checkpointer_after_restart,
            {"SYNTHETIC_ACTION": action},
            can_start_approval=lambda _request: True,
        )
        completed = manager_after_restart.resume(make_decision(request))

        assert completed.status is ApprovalStatus.COMPLETE
        assert completed.approval_id == request.approval_id
        assert action.calls == [
            (
                "test-operation",
                f"agent-approval:{request.approval_id}:{completed.decision_id}",
            )
        ]
        assert checkpointer_after_restart.get_checkpoint(request.approval_id) is None
    finally:
        checkpointer_after_restart.close()


def test_reject_stale_version_and_expiry_never_call_owner_action(
    database_url: str,
) -> None:
    action = FakeOwnerAction()
    checkpointer = AgentCheckpointer(database_url)
    checkpointer.open()
    manager = ApprovalManager(
        checkpointer,
        {"SYNTHETIC_ACTION": action},
        can_start_approval=lambda _request: True,
    )
    try:

        rejected_request = make_request()
        manager.start(rejected_request)
        rejected = manager.resume(make_decision(rejected_request, decision="REJECT"))
        assert rejected.status is ApprovalStatus.REJECTED

        stale_request = make_request()
        manager.start(stale_request)
        with pytest.raises(ApprovalValidationError) as stale:
            manager.resume(make_decision(stale_request, version="version-old"))
        assert stale.value.code is ApprovalErrorCode.STALE_VERSION

        expired_request = make_request(now=datetime.now(UTC) - timedelta(hours=25))
        with pytest.raises(ApprovalValidationError) as expired:
            manager.start(expired_request)
        assert expired.value.code is ApprovalErrorCode.EXPIRED

        pending_expiry = make_request()
        manager.start(pending_expiry)
        assert manager.cleanup_expired(pending_expiry.expires_at) == 1
        assert checkpointer.get_checkpoint(pending_expiry.approval_id) is None
        assert action.calls == []
    finally:
        checkpointer.close()


def test_rollback_blocks_new_approval_but_resolves_existing_checkpoint(
    database_url: str,
) -> None:
    enabled = True
    action = FakeOwnerAction()
    checkpointer = AgentCheckpointer(database_url)
    checkpointer.open()
    manager = ApprovalManager(
        checkpointer,
        {"SYNTHETIC_ACTION": action},
        can_start_approval=lambda _request: enabled,
    )
    try:
        pending_request = make_request()
        pending = manager.start(pending_request)
        assert pending.status is ApprovalStatus.PENDING

        enabled = False
        with pytest.raises(ApprovalValidationError) as disabled:
            manager.start(make_request())
        assert disabled.value.code is ApprovalErrorCode.CAPABILITY_DISABLED

        completed = manager.resume(make_decision(pending_request))
        assert completed.status is ApprovalStatus.COMPLETE
        assert len(action.calls) == 1
    finally:
        checkpointer.close()
