from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from math import isfinite
from typing import Annotated, Literal, TypedDict
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


@dataclass(frozen=True, slots=True)
class UnstructuredTextResponse:
    """Text returned by a structured provider that could not be decoded as JSON."""

    text: str = field(repr=False)


class AgentStatus(StrEnum):
    RUNNING = "RUNNING"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    INTERRUPTED = "INTERRUPTED"


class AgentErrorCode(StrEnum):
    INVALID_INPUT = "INVALID_INPUT"
    TOOL_NOT_ALLOWED = "TOOL_NOT_ALLOWED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    TOOL_ERROR = "TOOL_ERROR"
    EXECUTION_LIMIT_EXCEEDED = "EXECUTION_LIMIT_EXCEEDED"
    CANCELLED = "CANCELLED"
    INTERRUPTED = "INTERRUPTED"
    OUTPUT_INVALID = "OUTPUT_INVALID"


class AgentError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: AgentErrorCode
    safe_message: str
    retryable: bool = False


class AgentUsage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    steps: int = Field(default=0, ge=0)
    model_calls: int = Field(default=0, ge=0)
    tool_calls: int = Field(default=0, ge=0)
    elapsed_ms: int = Field(default=0, ge=0)


@dataclass(frozen=True, slots=True)
class ExecutionPolicy:
    max_steps: int = 16
    max_model_calls: int = 4
    max_tool_calls: int = 2
    timeout_seconds: float = 30.0

    def __post_init__(self) -> None:
        if type(self.max_steps) is not int or self.max_steps < 1:
            raise ValueError("max_steps must be a positive integer.")
        if type(self.max_model_calls) is not int or self.max_model_calls < 1:
            raise ValueError("max_model_calls must be a positive integer.")
        if type(self.max_tool_calls) is not int or self.max_tool_calls < 0:
            raise ValueError("max_tool_calls must be a non-negative integer.")
        if not isfinite(self.timeout_seconds) or self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be a finite positive number.")


class AgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: UUID
    correlation_id: str
    capability_id: str
    prompt: str
    input: dict[str, object] = Field(default_factory=dict)
    authorized_context: dict[str, object] = Field(default_factory=dict)
    locale: str | None = None


@dataclass(frozen=True, slots=True)
class AgentDefinition:
    capability_id: str
    model_profile: str
    output_model: type[BaseModel]
    system_instructions: str = ""
    tool_allowlist: frozenset[str] = field(default_factory=frozenset)
    execution_policy: ExecutionPolicy = field(default_factory=ExecutionPolicy)


class AgentResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: UUID
    correlation_id: str
    capability_id: str
    status: AgentStatus
    output: dict[str, object] | None = None
    error: AgentError | None = None
    usage: AgentUsage = Field(default_factory=AgentUsage)


class FinalDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["final"] = "final"
    output: dict[str, object]


class ToolCallDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["tool_call"] = "tool_call"
    tool_call_id: str = Field(min_length=1, max_length=128)
    tool_id: str = Field(min_length=1, max_length=128)
    input: dict[str, object]


type ModelDecision = Annotated[
    FinalDecision | ToolCallDecision,
    Field(discriminator="kind"),
]

_MODEL_DECISION_ADAPTER: TypeAdapter[ModelDecision] = TypeAdapter(ModelDecision)


def parse_model_decision(value: object) -> ModelDecision:
    return _MODEL_DECISION_ADAPTER.validate_python(value)


class AgentExecutionState(TypedDict, total=False):
    request: AgentRequest
    definition: AgentDefinition
    decision: ModelDecision
    status: AgentStatus
    output: dict[str, object]
    error: AgentError
    step_count: int
    model_call_count: int
    tool_call_count: int
    tool_results: list[dict[str, object]]
