import logging
from uuid import uuid4

from talentpulse_ai.agent_foundation.contracts import (
    AgentError,
    AgentErrorCode,
    AgentResult,
    AgentStatus,
    AgentUsage,
)
from talentpulse_ai.agent_foundation.observability import record_execution_observation


def test_synthetic_run_set_meets_sc005_metadata_coverage(caplog) -> None:
    results = [
        AgentResult(
            run_id=uuid4(),
            correlation_id=f"correlation-{index}",
            capability_id="synthetic.search",
            status=AgentStatus.COMPLETE if index < 19 else AgentStatus.FAILED,
            output={
                "prompt": "PROMPT_SECRET_MARKER",
                "cv": "CV_PII_SECRET_MARKER",
                "token": "TOKEN_SECRET_MARKER",
                "provider": "PROVIDER_PAYLOAD_MARKER",
            },
            error=(
                None
                if index < 19
                else AgentError(
                    code=AgentErrorCode.PROVIDER_ERROR,
                    safe_message="SAFE_MESSAGE_WITH_PRIVATE_MARKER",
                )
            ),
            usage=AgentUsage(steps=3, model_calls=1, tool_calls=0, elapsed_ms=12),
        )
        for index in range(20)
    ]

    with caplog.at_level(logging.INFO, logger="talentpulse_ai.agent_foundation.observability"):
        observations = [record_execution_observation(result) for result in results]

    complete = sum(
        1
        for observation in observations
        if observation.capability_id
        and observation.status
        and observation.duration_ms >= 0
        and (observation.status is not AgentStatus.FAILED or bool(observation.error_type))
    )
    assert complete / len(observations) >= 0.95
    assert len(caplog.records) == len(results)
    serialized_logs = "\n".join(record.getMessage() for record in caplog.records)
    for marker in (
        "PROMPT_SECRET_MARKER",
        "CV_PII_SECRET_MARKER",
        "TOKEN_SECRET_MARKER",
        "PROVIDER_PAYLOAD_MARKER",
        "SAFE_MESSAGE_WITH_PRIVATE_MARKER",
    ):
        assert marker not in serialized_logs


def test_observation_contains_stable_identifiers_counts_and_safe_error_type() -> None:
    result = AgentResult(
        run_id=uuid4(),
        correlation_id="corr-safe",
        capability_id="synthetic.cv",
        status=AgentStatus.FAILED,
        error=AgentError(
            code=AgentErrorCode.OUTPUT_INVALID,
            safe_message="Output invalid.",
        ),
        usage=AgentUsage(steps=4, model_calls=2, tool_calls=1, elapsed_ms=25),
    )

    observation = record_execution_observation(result)

    assert observation.run_id == result.run_id
    assert observation.correlation_id == "corr-safe"
    assert observation.capability_id == "synthetic.cv"
    assert observation.status is AgentStatus.FAILED
    assert observation.duration_ms == 25
    assert observation.model_calls == 2
    assert observation.tool_calls == 1
    assert observation.error_type == "OUTPUT_INVALID"
