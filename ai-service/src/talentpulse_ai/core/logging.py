import logging
import re
from collections.abc import Mapping
from typing import Literal
from uuid import UUID

from pydantic import ValidationError

from talentpulse_ai.core.exceptions import ProviderFailureDetails

_LOGGER = logging.getLogger("app.application.cv_generation")
_AI_PROVIDER_LOGGER = logging.getLogger("talentpulse_ai.provider")

_CAPABILITIES = frozenset({"rag_chat", "cv_analysis", "cv_generation", "job_indexing"})
_OPERATIONS = frozenset(
    {
        "retrieve",
        "generate",
        "analyze",
        "embed_query",
        "embed_document",
        "index_upsert",
        "index_delete",
        "localize",
        "agent_model",
    }
)
_ATTEMPTS = frozenset({"initial", "repair", "single", "agent_model"})
_MAX_ATTEMPT_INDEX = {"rag_chat": 4, "cv_analysis": 2, "cv_generation": 12}
_SAFE_VALIDATION_PART = re.compile(r"[A-Za-z0-9_-]{1,48}\Z")
_SAFE_VALIDATION_FIELDS = frozenset(
    {
        "answer_blocks",
        "explanation",
        "kind",
        "output",
        "input",
        "tool_call_id",
        "tool_id",
        "final",
        "tool_call",
        "text",
        "selected_job_ids",
        "claims",
        "claim_id",
        "type",
        "subject_id",
        "value",
        "citation_keys",
        "referenced_job_ids",
    }
)
_AGENT_VALIDATION_STAGES = frozenset(
    {"capability_output", "final_output", "repair_output", "repair_decision"}
)
_AGENT_DECISION_FIELDS = frozenset({"kind", "output", "tool_call_id", "tool_id", "input"})
_AGENT_OUTPUT_FIELDS = frozenset(
    {"answer_blocks", "claims", "citation_keys", "referenced_job_ids", "selected_job_ids"}
)
_AGENT_INPUT_FIELDS = frozenset({"job_id", "occupation_query"})


def validation_error_summary(error: ValidationError, *, limit: int = 5) -> str:
    """Return bounded field paths and error codes, never input or provider messages."""
    if type(limit) is not int or not 1 <= limit <= 10:
        return "none"
    summaries: list[str] = []
    try:
        for item in error.errors(include_input=False, include_context=False, include_url=False)[
            :limit
        ]:
            location = item.get("loc", ())
            parts = []
            for part in location:
                if type(part) is int:
                    parts.append(str(part))
                elif isinstance(part, str) and _SAFE_VALIDATION_PART.fullmatch(part):
                    parts.append(part if part in _SAFE_VALIDATION_FIELDS else "field")
            error_type = item.get("type")
            if (
                not parts
                or not isinstance(error_type, str)
                or not _SAFE_VALIDATION_PART.fullmatch(error_type)
            ):
                continue
            summaries.append(f"{'.'.join(parts)}:{error_type}")
    except Exception:
        return "none"
    return ",".join(summaries) or "none"


def agent_response_shape(value: object) -> str:
    """Summarize an Agent JSON response's schema shape without logging values or extra keys."""
    if not isinstance(value, Mapping):
        return _safe_json_type(value)

    parts = ["object"]
    kind = value.get("kind")
    if "kind" not in value:
        parts.append("kind=missing")
    elif isinstance(kind, str) and kind in {"final", "tool_call"}:
        parts.append(f"kind={kind}")
    else:
        parts.append("kind=unsupported" if isinstance(kind, str) else "kind=wrong_type")

    known_keys = sorted(key for key in _AGENT_DECISION_FIELDS if key in value)
    parts.append(f"keys={'-'.join(known_keys) if known_keys else 'none'}")
    extra_count = len(value) - len(known_keys)
    if extra_count:
        parts.append(f"extra={min(extra_count, 99)}")

    for field_name, allowed_fields in (
        ("output", _AGENT_OUTPUT_FIELDS),
        ("input", _AGENT_INPUT_FIELDS),
    ):
        nested = value.get(field_name)
        if field_name not in value:
            continue
        if not isinstance(nested, Mapping):
            parts.append(f"{field_name}={_safe_json_type(nested)}")
            continue
        parts.append(f"{field_name}=object")
        nested_keys = sorted(key for key in allowed_fields if key in nested)
        if nested_keys:
            parts.append(
                f"{field_name}_fields="
                + "-".join(f"{key}:{_safe_json_type(nested[key])}" for key in nested_keys)
            )
        nested_extra_count = len(nested) - len(nested_keys)
        if nested_extra_count:
            parts.append(f"{field_name}_extra={min(nested_extra_count, 99)}")
    return ".".join(parts)


def _safe_json_type(value: object) -> str:
    if value is None:
        return "null"
    if type(value) is bool:
        return "boolean"
    if type(value) in {int, float}:
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, Mapping):
        return "object"
    if isinstance(value, list):
        return "array"
    return "other"


def _validated_uuid(value: UUID | str | None) -> str:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, str):
        try:
            return str(UUID(value))
        except ValueError:
            return "none"
    return "none"


def log_ai_provider_failure(
    *,
    details: ProviderFailureDetails,
    capability: Literal["rag_chat", "cv_analysis", "cv_generation", "job_indexing"],
    operation: Literal[
        "retrieve",
        "generate",
        "analyze",
        "embed_query",
        "embed_document",
        "index_upsert",
        "index_delete",
        "localize",
        "agent_model",
    ],
    attempt: Literal["initial", "repair", "single", "agent_model"],
    request_id: UUID | str | None = None,
    trace_id: UUID | str | None = None,
    attempt_index: int | None = None,
    validation_errors: str | None = None,
    response_shape: str | None = None,
) -> None:
    """Emit one bounded internal event without affecting the caller's outcome."""
    try:
        if (
            not isinstance(details, ProviderFailureDetails)
            or capability not in _CAPABILITIES
            or operation not in _OPERATIONS
            or attempt not in _ATTEMPTS
        ):
            return
        max_attempt_index = _MAX_ATTEMPT_INDEX.get(capability)
        if attempt_index is not None and (
            type(attempt_index) is not int
            or max_attempt_index is None
            or not 1 <= attempt_index <= max_attempt_index
        ):
            return

        optional: Mapping[str, str] = {
            "model": details.model or "none",
            "attempt_index": str(attempt_index) if attempt_index is not None else "none",
            "provider_status": (
                str(details.provider_status) if details.provider_status is not None else "none"
            ),
            "provider_code": details.provider_code or "none",
            "provider_message": details.provider_message or "none",
            "exception_type": details.exception_type or "none",
            "duration_ms": str(details.duration_ms) if details.duration_ms is not None else "none",
            "validation_errors": _validated_validation_summary(validation_errors),
        }
        if response_shape is not None:
            optional = {
                **optional,
                "response_shape": _validated_response_shape(response_shape),
            }
        event = (
            "ai_provider_failure"
            f" capability={capability} provider={details.provider} model={optional['model']}"
            f" operation={operation} attempt={attempt}"
            f" attempt_index={optional['attempt_index']} category={details.category}"
            f" request_id={_validated_uuid(request_id)} trace_id={_validated_uuid(trace_id)}"
            f" provider_status={optional['provider_status']}"
            f" provider_code={optional['provider_code']}"
            f" provider_message={optional['provider_message']}"
            f" exception_type={optional['exception_type']}"
            f" duration_ms={optional['duration_ms']}"
            f" validation_errors={optional['validation_errors']}"
        )
        if "response_shape" in optional:
            event += f" response_shape={optional['response_shape']}"
        _AI_PROVIDER_LOGGER.warning(event)
    except Exception:
        return


def log_ai_agent_validation_failure(
    *,
    stage: Literal["capability_output", "final_output", "repair_output", "repair_decision"],
    request_id: UUID | str | None = None,
    trace_id: UUID | str | None = None,
    attempt_index: int | None = None,
    validation_errors: str | None = None,
    response_shape: str | None = None,
) -> None:
    """Record schema/contract rejection paths without model values or prompt content."""
    try:
        if stage not in _AGENT_VALIDATION_STAGES:
            return
        if attempt_index is not None and (
            type(attempt_index) is not int
            or not 1 <= attempt_index <= _MAX_ATTEMPT_INDEX["rag_chat"]
        ):
            return
        event = (
            "ai_agent_validation_failure capability=rag_chat"
            f" stage={stage} attempt_index={attempt_index if attempt_index is not None else 'none'}"
            f" request_id={_validated_uuid(request_id)} trace_id={_validated_uuid(trace_id)}"
            f" validation_errors={_validated_validation_summary(validation_errors)}"
        )
        if response_shape is not None:
            event += f" response_shape={_validated_response_shape(response_shape)}"
        _AI_PROVIDER_LOGGER.warning(event)
    except Exception:
        return


def _validated_validation_summary(value: str | None) -> str:
    if not isinstance(value, str) or len(value) > 512:
        return "none"
    if value == "none" or re.fullmatch(r"[A-Za-z0-9_.:-]+(?:,[A-Za-z0-9_.:-]+)*", value):
        return value
    return "none"


def _validated_response_shape(value: str) -> str:
    if len(value) <= 512 and re.fullmatch(r"[A-Za-z0-9_.:,=-]+", value):
        return value
    return "none"
