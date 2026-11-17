from __future__ import annotations

from threading import Event
from time import monotonic
from typing import Literal

from talentpulse_ai.agent_foundation.contracts import (
    AgentError,
    AgentErrorCode,
    ExecutionPolicy,
)


def remaining_time_seconds(policy: ExecutionPolicy, started_at: float) -> float:
    return max(0.0, policy.timeout_seconds - (monotonic() - started_at))


def interruption_error(
    policy: ExecutionPolicy,
    started_at: float,
    cancellation_event: Event | None,
) -> AgentError | None:
    if cancellation_event is not None and cancellation_event.is_set():
        return AgentError(
            code=AgentErrorCode.CANCELLED,
            safe_message="Agent execution was cancelled.",
        )
    if remaining_time_seconds(policy, started_at) <= 0:
        return AgentError(
            code=AgentErrorCode.EXECUTION_LIMIT_EXCEEDED,
            safe_message="Agent execution deadline was reached.",
        )
    return None


def check_execution_budget(
    policy: ExecutionPolicy,
    *,
    started_at: float,
    step_count: int,
    model_call_count: int,
    tool_call_count: int,
    operation: Literal["model", "tool"],
    cancellation_event: Event | None = None,
) -> AgentError | None:
    error = interruption_error(policy, started_at, cancellation_event)
    if error is not None:
        return error
    if step_count >= policy.max_steps:
        return AgentError(
            code=AgentErrorCode.EXECUTION_LIMIT_EXCEEDED,
            safe_message="Agent step limit was reached.",
        )
    if operation == "model" and model_call_count >= policy.max_model_calls:
        return AgentError(
            code=AgentErrorCode.EXECUTION_LIMIT_EXCEEDED,
            safe_message="Agent model-call limit was reached.",
        )
    if operation == "tool":
        if model_call_count >= policy.max_model_calls:
            return AgentError(
                code=AgentErrorCode.EXECUTION_LIMIT_EXCEEDED,
                safe_message="Agent model-call limit was reached.",
            )
        if tool_call_count >= policy.max_tool_calls:
            return AgentError(
                code=AgentErrorCode.EXECUTION_LIMIT_EXCEEDED,
                safe_message="Agent tool-call limit was reached.",
            )
    return None
