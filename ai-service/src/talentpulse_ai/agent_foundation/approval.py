from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Annotated, Protocol, TypedDict
from uuid import UUID, uuid4

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Command, interrupt
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
    field_validator,
    model_validator,
)

OpaqueReference = Annotated[
    str,
    Field(min_length=1, max_length=160, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$"),
]


class ApprovalStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


class ApprovalDecisionValue(StrEnum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"


class ApprovalErrorCode(StrEnum):
    INVALID_DECISION = "INVALID_DECISION"
    EXPIRED = "EXPIRED"
    STALE_VERSION = "STALE_VERSION"
    DUPLICATE_DECISION = "DUPLICATE_DECISION"
    DUPLICATE_APPROVAL = "DUPLICATE_APPROVAL"
    CAPABILITY_DISABLED = "CAPABILITY_DISABLED"
    NOT_PENDING = "NOT_PENDING"
    NOT_FOUND = "NOT_FOUND"
    ACTION_UNAVAILABLE = "ACTION_UNAVAILABLE"
    ACTION_FAILED = "ACTION_FAILED"


class ApprovalValidationError(ValueError):
    def __init__(self, code: ApprovalErrorCode, safe_message: str) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message


class ApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    approval_id: UUID
    operation_ref: OpaqueReference
    resource_ref: OpaqueReference
    expected_version: Annotated[
        str,
        Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$"),
    ]
    action_code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{0,63}$")
    created_at: datetime
    expires_at: datetime
    graph_schema_version: int = Field(default=1, ge=1)

    @field_validator("created_at", "expires_at")
    @classmethod
    def require_utc_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() != timedelta(0):
            raise ValueError("approval timestamps must be timezone-aware UTC values")
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def fixed_expiration(self) -> ApprovalRequest:
        if self.expires_at != self.created_at + timedelta(hours=24):
            raise ValueError("approval expiry must be fixed at 24 hours")
        return self


class ApprovalDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    approval_id: UUID
    decision: ApprovalDecisionValue
    decision_id: UUID
    operation_ref: OpaqueReference
    expected_version: Annotated[
        str,
        Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$"),
    ]


class ApprovalResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approval_id: UUID
    status: ApprovalStatus
    decision_id: UUID | None = None
    action_result_ref: OpaqueReference | None = None
    error_code: ApprovalErrorCode | None = None


class ApprovalState(TypedDict, total=False):
    approval: dict[str, object]
    status: str
    decision: dict[str, object]
    action_result_ref: OpaqueReference
    error_code: str


class ApprovalActionExecutor(Protocol):
    def execute(self, request: ApprovalRequest, *, idempotency_key: str) -> str: ...


class ApprovalCheckpointPort(Protocol):
    @property
    def saver(self) -> BaseCheckpointSaver[str]: ...

    def get_checkpoint(self, approval_id: UUID) -> object | None: ...

    def delete_thread(self, approval_id: UUID) -> None: ...

    def cleanup_expired(
        self,
        now: datetime | None = None,
        *,
        exclude_approval_id: UUID | None = None,
    ) -> int: ...


def create_approval_request(
    *,
    operation_ref: str,
    resource_ref: str,
    expected_version: str,
    action_code: str,
    now: datetime | None = None,
    approval_id: UUID | None = None,
) -> ApprovalRequest:
    created_at = now or datetime.now(UTC)
    if created_at.tzinfo is None or created_at.utcoffset() != timedelta(0):
        raise ValueError("approval creation time must be timezone-aware UTC")
    created_at = created_at.astimezone(UTC)
    return ApprovalRequest(
        approval_id=approval_id or uuid4(),
        operation_ref=operation_ref,
        resource_ref=resource_ref,
        expected_version=expected_version,
        action_code=action_code,
        created_at=created_at,
        expires_at=created_at + timedelta(hours=24),
    )


def validate_approval_decision(
    request: ApprovalRequest,
    decision: ApprovalDecision,
    *,
    now: datetime,
    status: ApprovalStatus = ApprovalStatus.PENDING,
    consumed_decision_ids: frozenset[UUID] = frozenset(),
) -> None:
    if status is not ApprovalStatus.PENDING:
        raise ApprovalValidationError(
            ApprovalErrorCode.NOT_PENDING,
            "Approval is not pending.",
        )
    if now.tzinfo is None or now.utcoffset() != timedelta(0):
        raise ValueError("decision validation time must be timezone-aware UTC")
    if now.astimezone(UTC) >= request.expires_at:
        raise ApprovalValidationError(
            ApprovalErrorCode.EXPIRED,
            "Approval has expired.",
        )
    if decision.decision_id in consumed_decision_ids:
        raise ApprovalValidationError(
            ApprovalErrorCode.DUPLICATE_DECISION,
            "Approval decision has already been used.",
        )
    if decision.approval_id != request.approval_id:
        raise ApprovalValidationError(
            ApprovalErrorCode.INVALID_DECISION,
            "Approval decision does not match this request.",
        )
    if (
        decision.operation_ref != request.operation_ref
        or decision.expected_version != request.expected_version
    ):
        raise ApprovalValidationError(
            ApprovalErrorCode.STALE_VERSION,
            "Approval reference or version is stale.",
        )


def approval_state_payload(state: Mapping[str, object]) -> dict[str, object]:
    allowed_keys = {
        "approval",
        "status",
        "decision",
        "action_result_ref",
        "error_code",
    }
    if set(state) - allowed_keys:
        raise ValueError("Approval state contains unsupported fields.")

    approval = state.get("approval")
    status = state.get("status")
    if not isinstance(approval, (ApprovalRequest, Mapping)) or not isinstance(
        status, (str, ApprovalStatus)
    ):
        raise ValueError("Approval state is incomplete.")

    approval_model = (
        approval
        if isinstance(approval, ApprovalRequest)
        else ApprovalRequest.model_validate(approval)
    )

    payload: dict[str, object] = {
        "approval": approval_model.model_dump(mode="json"),
        "status": status.value if isinstance(status, ApprovalStatus) else status,
    }
    decision = state.get("decision")
    if decision is not None:
        if not isinstance(decision, (ApprovalDecision, Mapping)):
            raise ValueError("Approval decision is invalid.")
        decision_model = ApprovalDecision.model_validate(decision)
        payload["decision"] = decision_model.model_dump(mode="json")
    action_result_ref = state.get("action_result_ref")
    if action_result_ref is not None:
        payload["action_result_ref"] = TypeAdapter(OpaqueReference).validate_python(
            action_result_ref
        )
    error_code = state.get("error_code")
    if error_code is not None:
        if not isinstance(error_code, (str, ApprovalErrorCode)):
            raise ValueError("Approval error code is invalid.")
        payload["error_code"] = (
            error_code.value if isinstance(error_code, ApprovalErrorCode) else error_code
        )
    return payload


def build_approval_graph(
    checkpointer: BaseCheckpointSaver[str],
    action_executors: Mapping[str, ApprovalActionExecutor],
) -> CompiledStateGraph[ApprovalState, None, ApprovalState, ApprovalState]:
    graph = StateGraph(ApprovalState)

    def await_approval(state: ApprovalState) -> dict[str, object]:
        raw_request = state.get("approval")
        if raw_request is None or state.get("status") != ApprovalStatus.PENDING.value:
            return {
                "status": ApprovalStatus.FAILED.value,
                "error_code": ApprovalErrorCode.NOT_PENDING.value,
            }
        try:
            request = ApprovalRequest.model_validate(raw_request)
        except ValidationError:
            return {
                "status": ApprovalStatus.FAILED.value,
                "error_code": ApprovalErrorCode.INVALID_DECISION.value,
            }
        raw_decision = interrupt(
            {
                "approval_id": str(request.approval_id),
                "operation_ref": request.operation_ref,
                "resource_ref": request.resource_ref,
                "expected_version": request.expected_version,
                "action_code": request.action_code,
                "expires_at": request.expires_at.isoformat(),
            },
            response_schema=ApprovalDecision,
        )
        try:
            decision = ApprovalDecision.model_validate(raw_decision)
            validate_approval_decision(
                request,
                decision,
                now=datetime.now(UTC),
            )
        except ValidationError:
            return {
                "status": ApprovalStatus.REJECTED.value,
                "error_code": ApprovalErrorCode.INVALID_DECISION.value,
            }
        except ApprovalValidationError as error:
            return {
                "status": (
                    ApprovalStatus.EXPIRED.value
                    if error.code is ApprovalErrorCode.EXPIRED
                    else ApprovalStatus.REJECTED.value
                ),
                "error_code": error.code.value,
            }

        if decision.decision is ApprovalDecisionValue.REJECT:
            return {
                "decision": decision.model_dump(mode="json"),
                "status": ApprovalStatus.REJECTED.value,
            }
        return {
            "decision": decision.model_dump(mode="json"),
            "status": ApprovalStatus.APPROVED.value,
        }

    def route_after_decision(state: ApprovalState) -> str:
        return "execute_action" if state.get("status") == ApprovalStatus.APPROVED.value else END

    def execute_action(state: ApprovalState) -> dict[str, object]:
        raw_request = state.get("approval")
        raw_decision = state.get("decision")
        if raw_request is None or raw_decision is None:
            return {
                "status": ApprovalStatus.FAILED.value,
                "error_code": ApprovalErrorCode.INVALID_DECISION.value,
            }
        try:
            request = ApprovalRequest.model_validate(raw_request)
            decision = ApprovalDecision.model_validate(raw_decision)
        except ValidationError:
            return {
                "status": ApprovalStatus.FAILED.value,
                "error_code": ApprovalErrorCode.INVALID_DECISION.value,
            }
        executor = action_executors.get(request.action_code)
        if executor is None:
            return {
                "status": ApprovalStatus.FAILED.value,
                "error_code": ApprovalErrorCode.ACTION_UNAVAILABLE.value,
            }
        try:
            result_ref = executor.execute(
                request,
                idempotency_key=f"agent-approval:{request.approval_id}:{decision.decision_id}",
            )
        except Exception:
            return {
                "status": ApprovalStatus.FAILED.value,
                "error_code": ApprovalErrorCode.ACTION_FAILED.value,
            }
        if not isinstance(result_ref, str):
            return {
                "status": ApprovalStatus.FAILED.value,
                "error_code": ApprovalErrorCode.ACTION_FAILED.value,
            }
        try:
            result_ref = TypeAdapter(OpaqueReference).validate_python(result_ref)
        except ValidationError:
            return {
                "status": ApprovalStatus.FAILED.value,
                "error_code": ApprovalErrorCode.ACTION_FAILED.value,
            }
        return {
            "status": ApprovalStatus.COMPLETE.value,
            "action_result_ref": result_ref,
        }

    graph.add_node("await_approval", await_approval)
    graph.add_node("execute_action", execute_action)
    graph.add_edge(START, "await_approval")
    graph.add_conditional_edges(
        "await_approval",
        route_after_decision,
        {"execute_action": "execute_action", END: END},
    )
    graph.add_edge("execute_action", END)
    return graph.compile(checkpointer=checkpointer)


class ApprovalManager:
    def __init__(
        self,
        checkpointer: ApprovalCheckpointPort,
        action_executors: Mapping[str, ApprovalActionExecutor],
        *,
        can_start_approval: Callable[[ApprovalRequest], bool],
    ) -> None:
        self._checkpointer = checkpointer
        self._action_executors = dict(action_executors)
        self._can_start_approval = can_start_approval
        self._graph = build_approval_graph(checkpointer.saver, self._action_executors)

    def start(self, request: ApprovalRequest) -> ApprovalResult:
        now = datetime.now(UTC)
        if not self._can_start_approval(request):
            raise ApprovalValidationError(
                ApprovalErrorCode.CAPABILITY_DISABLED,
                "Approval workflow is disabled for new executions.",
            )
        if request.expires_at <= now:
            raise ApprovalValidationError(
                ApprovalErrorCode.EXPIRED,
                "Approval has expired.",
            )
        if request.action_code not in self._action_executors:
            raise ApprovalValidationError(
                ApprovalErrorCode.ACTION_UNAVAILABLE,
                "Approval action is not registered.",
            )
        self._checkpointer.cleanup_expired(now)
        config = self._config(request.approval_id, request)
        if self._graph.get_state(config).values:
            raise ApprovalValidationError(
                ApprovalErrorCode.DUPLICATE_APPROVAL,
                "Approval ID is already in use.",
            )
        result = self._graph.invoke(
            {
                "approval": request.model_dump(mode="json"),
                "status": ApprovalStatus.PENDING.value,
            },
            config=config,
        )
        return ApprovalResult(
            approval_id=request.approval_id,
            status=result.get("status", ApprovalStatus.FAILED),
            error_code=result.get("error_code"),
        )

    def resume(self, decision: ApprovalDecision) -> ApprovalResult:
        config = self._config(decision.approval_id)
        state = self._graph.get_state(config).values
        raw_request = state.get("approval")
        status = state.get("status")
        if not isinstance(raw_request, Mapping):
            raise ApprovalValidationError(
                ApprovalErrorCode.NOT_FOUND,
                "Approval was not found.",
            )
        request = ApprovalRequest.model_validate(raw_request)
        if status != ApprovalStatus.PENDING.value:
            self._checkpointer.delete_thread(decision.approval_id)
            raise ApprovalValidationError(
                ApprovalErrorCode.NOT_PENDING,
                "Approval is not pending.",
            )
        try:
            validate_approval_decision(request, decision, now=datetime.now(UTC))
        except ApprovalValidationError as error:
            if error.code in {ApprovalErrorCode.EXPIRED, ApprovalErrorCode.STALE_VERSION}:
                self._checkpointer.delete_thread(decision.approval_id)
            raise

        self._checkpointer.cleanup_expired(exclude_approval_id=decision.approval_id)
        result = self._graph.invoke(
            Command(resume=decision.model_dump(mode="json")),
            config=self._config(decision.approval_id, request),
        )
        status = result.get("status", ApprovalStatus.FAILED)
        if status in {
            item.value
            for item in (
                ApprovalStatus.COMPLETE,
                ApprovalStatus.REJECTED,
                ApprovalStatus.EXPIRED,
                ApprovalStatus.FAILED,
            )
        }:
            self._checkpointer.delete_thread(decision.approval_id)
        return ApprovalResult(
            approval_id=decision.approval_id,
            status=status,
            decision_id=decision.decision_id,
            action_result_ref=result.get("action_result_ref"),
            error_code=result.get("error_code"),
        )

    def cleanup_expired(self, now: datetime | None = None) -> int:
        return self._checkpointer.cleanup_expired(now)

    @staticmethod
    def _config(
        approval_id: UUID,
        request: ApprovalRequest | None = None,
    ) -> RunnableConfig:
        config: RunnableConfig = {
            "configurable": {"thread_id": str(approval_id), "checkpoint_ns": ""}
        }
        if request is not None:
            config["metadata"] = {
                "agent_approval_id": str(request.approval_id),
                "agent_approval_expires_at": request.expires_at.isoformat(timespec="microseconds"),
                "graph_schema_version": request.graph_schema_version,
            }
        return config
