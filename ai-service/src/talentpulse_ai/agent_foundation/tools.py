from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from math import isfinite
from types import MappingProxyType
from typing import Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from talentpulse_ai.agent_foundation.contracts import (
    AgentDefinition,
    AgentErrorCode,
    AgentRequest,
    ToolCallDecision,
)


class ToolSideEffect(StrEnum):
    READ_ONLY = "READ_ONLY"
    CONTROLLED_WRITE = "CONTROLLED_WRITE"


@dataclass(frozen=True, slots=True)
class ToolExecutionContext:
    run_id: UUID
    correlation_id: str
    capability_id: str
    timeout_seconds: float
    authorized_context: Mapping[str, object]


ToolHandler = Callable[[BaseModel, ToolExecutionContext], object]


class ToolResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool_call_id: str
    tool_id: str
    output: dict[str, object]


@dataclass(frozen=True, slots=True)
class ToolDefinition:
    tool_id: str
    description: str
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    allowed_capabilities: frozenset[str]
    required_operation: str
    timeout_seconds: float
    side_effect_class: ToolSideEffect
    handler: ToolHandler

    def __post_init__(self) -> None:
        if not self.tool_id or not self.description or not self.required_operation:
            raise ValueError("Tool identity, description, and operation are required.")
        if not self.allowed_capabilities:
            raise ValueError("Tool must be allowlisted for at least one capability.")
        if not isfinite(self.timeout_seconds) or self.timeout_seconds <= 0:
            raise ValueError("Tool timeout must be a finite positive number.")


class ToolAuthorizer(Protocol):
    """Application-owned authorization boundary for a requested tool operation."""

    def is_authorized(self, request: AgentRequest, operation: str) -> bool:
        ...


class ToolRegistry:
    def __init__(self, definitions: tuple[ToolDefinition, ...] = ()) -> None:
        self._definitions: dict[str, ToolDefinition] = {}
        for definition in definitions:
            self.register(definition)

    def register(self, definition: ToolDefinition) -> None:
        if definition.tool_id in self._definitions:
            raise ValueError("Tool ID is already registered.")
        self._definitions[definition.tool_id] = definition

    def get(self, tool_id: str) -> ToolDefinition | None:
        return self._definitions.get(tool_id)


class ToolDispatchError(RuntimeError):
    def __init__(self, code: AgentErrorCode, safe_message: str) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message


class ToolDispatcher:
    def __init__(self, registry: ToolRegistry, authorizer: ToolAuthorizer) -> None:
        self._registry = registry
        self._authorizer = authorizer

    def dispatch(
        self,
        decision: ToolCallDecision,
        *,
        request: AgentRequest,
        definition: AgentDefinition,
        remaining_tool_calls: int,
        remaining_time_seconds: float | None = None,
    ) -> ToolResult:
        tool = self._registry.get(decision.tool_id)
        if (
            tool is None
            or request.capability_id != definition.capability_id
            or decision.tool_id not in definition.tool_allowlist
            or request.capability_id not in tool.allowed_capabilities
        ):
            raise ToolDispatchError(
                AgentErrorCode.TOOL_NOT_ALLOWED,
                "Tool is not allowed for this capability.",
            )

        if remaining_tool_calls <= 0:
            raise ToolDispatchError(
                AgentErrorCode.EXECUTION_LIMIT_EXCEEDED,
                "Tool call limit has been reached.",
            )

        effective_timeout = tool.timeout_seconds
        if remaining_time_seconds is not None:
            if not isfinite(remaining_time_seconds) or remaining_time_seconds <= 0:
                raise ToolDispatchError(
                    AgentErrorCode.EXECUTION_LIMIT_EXCEEDED,
                    "Execution deadline has been reached.",
                )
            effective_timeout = min(effective_timeout, remaining_time_seconds)

        try:
            authorized = self._authorizer.is_authorized(request, tool.required_operation)
        except Exception:
            authorized = False
        if authorized is not True:
            raise ToolDispatchError(
                AgentErrorCode.PERMISSION_DENIED,
                "Tool operation is not authorized.",
            )

        try:
            validated_input = tool.input_model.model_validate(decision.input)
        except (ValidationError, TypeError, ValueError):
            raise ToolDispatchError(
                AgentErrorCode.INVALID_INPUT,
                "Tool input does not match its schema.",
            ) from None

        context = ToolExecutionContext(
            run_id=request.run_id,
            correlation_id=request.correlation_id,
            capability_id=request.capability_id,
            timeout_seconds=effective_timeout,
            authorized_context=MappingProxyType(dict(request.authorized_context)),
        )
        try:
            raw_output = tool.handler(validated_input, context)
        except Exception:
            raise ToolDispatchError(
                AgentErrorCode.TOOL_ERROR,
                "Tool execution failed.",
            ) from None

        try:
            output = tool.output_model.model_validate(raw_output)
        except (ValidationError, TypeError, ValueError):
            raise ToolDispatchError(
                AgentErrorCode.OUTPUT_INVALID,
                "Tool output does not match its schema.",
            ) from None

        return ToolResult(
            tool_call_id=decision.tool_call_id,
            tool_id=decision.tool_id,
            output=output.model_dump(mode="json"),
        )
