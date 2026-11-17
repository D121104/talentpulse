from __future__ import annotations

import logging
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from talentpulse_ai.agent_foundation.contracts import AgentResult, AgentStatus

_LOGGER = logging.getLogger(__name__)


class AgentExecutionObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: UUID
    correlation_id: str = Field(min_length=1)
    capability_id: str = Field(min_length=1)
    implementation: Literal["agent"] = "agent"
    status: AgentStatus
    duration_ms: int = Field(ge=0)
    steps: int = Field(ge=0)
    model_calls: int = Field(ge=0)
    tool_calls: int = Field(ge=0)
    error_type: str | None


def record_execution_observation(result: AgentResult) -> AgentExecutionObservation:
    observation = AgentExecutionObservation(
        run_id=result.run_id,
        correlation_id=result.correlation_id,
        capability_id=result.capability_id,
        status=result.status,
        duration_ms=result.usage.elapsed_ms,
        steps=result.usage.steps,
        model_calls=result.usage.model_calls,
        tool_calls=result.usage.tool_calls,
        error_type=result.error.code.value if result.error is not None else None,
    )
    _LOGGER.info(
        "agent_execution run_id=%s correlation_id=%s capability_id=%s "
        "implementation=%s status=%s duration_ms=%d steps=%d model_calls=%d "
        "tool_calls=%d error_type=%s",
        observation.run_id,
        observation.correlation_id,
        observation.capability_id,
        observation.implementation,
        observation.status,
        observation.duration_ms,
        observation.steps,
        observation.model_calls,
        observation.tool_calls,
        observation.error_type or "none",
    )
    return observation
