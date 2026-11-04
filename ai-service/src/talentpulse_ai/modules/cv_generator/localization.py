from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from talentpulse_ai.modules.cv_generator.context_builder import (
    _localization_target_key,
    _localization_targets,
    _scalar_target_plan,
)
from talentpulse_ai.modules.cv_generator.core_generation import _PROVIDER_WARNING
from talentpulse_ai.modules.cv_generator.prompt_builder import render_scalar_batch_prompt
from talentpulse_ai.modules.cv_generator.provider_runtime import (
    ProviderRuntime,
    _is_timeout_exception,
)
from talentpulse_ai.modules.cv_generator.schemas import CvDraftRequest
from talentpulse_ai.modules.cv_generator.validators import (
    _localized_value_is_grounded,
    _translation_cache_key,
    _validate_localized_payload,
)

_LOCALIZATION_WARNING = (
    "Some source fields could not be localized with sufficient factual grounding; "
    "edit the draft or retry generation before publishing."
)


@dataclass(frozen=True)
class LocalizationPolicy:
    chunk_size: int
    max_source_chars: int
    repair_chunk_size: int
    max_repair_calls: int
    num_predict: int
    non_retryable_failures: frozenset[str]


@dataclass
class LocalizationResult:
    fields: dict[tuple[str, int, str], str]
    provider_used: bool
    cache_hits: int
    target_count: int
    unique_target_count: int
    repair_calls: int
    unresolved_count: int
    failure_details: list[str]


@dataclass
class _LocalizationStage:
    request: CvDraftRequest
    runtime: ProviderRuntime
    policy: LocalizationPolicy
    localized_fields: dict[tuple[str, int, str], str] = field(default_factory=dict)
    provider_used: bool = False
    translation_cache: dict[tuple[str, str], str] = field(default_factory=dict)
    translation_groups: dict[tuple[str, str], list[dict[str, object]]] = field(default_factory=dict)
    pending: dict[str, dict[str, object]] = field(default_factory=dict)
    failure_reasons: dict[str, str] = field(default_factory=dict)
    accepted_plan_keys: set[str] = field(default_factory=set)

    def merge_scalar(
        self,
        section: str,
        source_index: int,
        field: str,
        value: str | None,
    ) -> str | None:
        accepted, reason = _localized_value_is_grounded(
            self.request,
            value,
            section=section,
            source_index=source_index,
            field=field,
        )
        if accepted is None:
            return reason or "localization_rejection"
        self.localized_fields[(section, source_index, field)] = accepted
        self.provider_used = True
        return None

    def apply_batch_value(self, plan: Mapping[str, object], value: str) -> str | None:
        source = plan.get("source")
        if not isinstance(source, str):
            return "localization_target_rejection"
        cache_key = _translation_cache_key(source, self.request.locale)
        first_rejection: str | None = None
        accepted_any = False
        for alias in self.translation_groups.get(cache_key, [dict(plan)]):
            section = alias.get("section")
            source_index = alias.get("source_index")
            field = alias.get("field")
            if (
                not isinstance(section, str)
                or not isinstance(source_index, int)
                or not isinstance(field, str)
            ):
                first_rejection = first_rejection or "localization_target_rejection"
                continue
            rejection = self.merge_scalar(section, source_index, field, value)
            if rejection is None:
                accepted_any = True
            else:
                first_rejection = first_rejection or rejection
                self.runtime.mark(rejection)
        plan_key = plan.get("key")
        if accepted_any and isinstance(plan_key, str):
            self.accepted_plan_keys.add(plan_key)
            self.translation_cache[cache_key] = value
        return None if accepted_any else (first_rejection or "localization_rejection")

    def process_localization_batch(
        self,
        batch: Sequence[Mapping[str, object]],
        *,
        retry: bool,
        retry_reasons: Mapping[str, str] | None = None,
    ) -> bool:
        request = self.request
        runtime = self.runtime
        policy = self.policy
        mark = runtime.mark
        invoke = runtime.invoke
        total_deadline = runtime.total_deadline
        pending = self.pending
        failure_reasons = self.failure_reasons
        if not batch:
            return False
        requested_keys = {key for target in batch if isinstance((key := target.get("key")), str)}
        # The static list schema permits a valid one-item answer to a six-item request.
        # Constrain this call's shape, while still validating returned keys locally.
        batch_schema = {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "minItems": len(requested_keys),
                    "maxItems": len(requested_keys),
                    "items": {
                        "type": "object",
                        "properties": {
                            "key": {"type": "string", "enum": sorted(requested_keys)},
                            "text": {"type": "string"},
                        },
                        "required": ["key", "text"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["items"],
            "additionalProperties": False,
        }
        try:
            raw = invoke(
                render_scalar_batch_prompt(
                    request,
                    batch,
                    retry=retry,
                    retry_reasons=retry_reasons,
                ),
                batch_schema,
                deadline=total_deadline,
                timeout=(
                    runtime.limits.repair_timeout_seconds
                    if retry
                    else runtime.limits.chunk_timeout_seconds
                ),
                call_kind="localization_repair" if retry else "localization_primary",
                num_predict=policy.num_predict * len(requested_keys),
            )
            values, unknown_count, duplicate_count = _validate_localized_payload(
                raw, requested_keys
            )
            if unknown_count:
                mark("localization_unknown_key", unknown_count)
            if duplicate_count:
                mark("localization_duplicate_key", duplicate_count)
        except TimeoutError as exc:
            reason = (
                "provider_call_cap"
                if "cap" in str(exc)
                else "provider_deadline"
                if "deadline" in str(exc)
                else "provider_timeout"
            )
            mark(reason)
            for target in batch:
                key = target.get("key")
                if isinstance(key, str):
                    pending[key] = dict(target)
                    failure_reasons[key] = reason
            return False
        except Exception as exc:
            reason = (
                "schema_validation"
                if callable(getattr(exc, "errors", None))
                else "provider_timeout"
                if _is_timeout_exception(exc)
                else "provider_exception"
            )
            mark(reason)
            for target in batch:
                key = target.get("key")
                if isinstance(key, str):
                    pending[key] = dict(target)
                    failure_reasons[key] = reason
            return True

        for target in batch:
            key = target.get("key")
            if not isinstance(key, str):
                mark("localization_target_rejection")
                continue
            value = values.get(key)
            if value is None:
                pending[key] = dict(target)
                failure_reasons[key] = "localization_missing"
                continue
            rejection = self.apply_batch_value(target, value)
            if rejection is not None:
                pending[key] = dict(target)
                failure_reasons[key] = rejection
        for key in tuple(pending):
            if key in self.accepted_plan_keys:
                pending.pop(key, None)
                failure_reasons.pop(key, None)
        return True


def _localization_batches(
    targets: Sequence[dict[str, object]],
    chunk_size: int,
    max_source_chars: int,
) -> list[list[dict[str, object]]]:
    batches: list[list[dict[str, object]]] = []
    batch: list[dict[str, object]] = []
    source_chars = 0
    for target in targets:
        source = target.get("source")
        size = len(source) if isinstance(source, str) else 0
        if batch and (len(batch) >= chunk_size or source_chars + size > max_source_chars):
            batches.append(batch)
            batch = []
            source_chars = 0
        batch.append(target)
        source_chars += size
    if batch:
        batches.append(batch)
    return batches


def _plan_label(section: str, source_index: int, field: str) -> str:
    return f"{section}[{source_index}].{field}"


def _record_scalar_failure(
    runtime: ProviderRuntime, details: list[str], label: str, reason: str
) -> None:
    runtime.mark("localization_failure/omission")
    detail = f"{label}:{reason}"
    if detail not in details:
        details.append(detail)


def localize_fields(
    request: CvDraftRequest,
    runtime: ProviderRuntime,
    policy: LocalizationPolicy,
    warnings: list[str],
) -> LocalizationResult:
    stage = _LocalizationStage(request, runtime, policy)
    mark = runtime.mark
    total_deadline = runtime.total_deadline
    localized_fields = stage.localized_fields
    pending = stage.pending
    failure_reasons = stage.failure_reasons
    accepted_plan_keys = stage.accepted_plan_keys
    # Build target keys and deduplicate equal source text before provider calls. Mapping
    # from provider keys back to CV fields stays entirely in this application-side plan.
    plans = _scalar_target_plan(request, localized_fields)
    cache_hits = 0
    localization_failure_details: list[str] = []
    for plan in plans:
        section = plan.get("section")
        source_index = plan.get("source_index")
        field_name = plan.get("field")
        source = plan.get("source")
        if (
            not isinstance(section, str)
            or not isinstance(source_index, int)
            or not isinstance(field_name, str)
            or not isinstance(source, str)
            or not source.strip()
        ):
            mark("localization_target_rejection")
            continue
        cache_key = _translation_cache_key(source, request.locale)
        cached = stage.translation_cache.get(cache_key)
        if cached is not None:
            cache_hits += 1
            rejection = stage.merge_scalar(section, source_index, field_name, cached)
            if rejection is not None:
                mark(rejection)
            continue
        group = stage.translation_groups.setdefault(cache_key, [])
        if group:
            # Equal source values are translated once and merged to every target key.
            cache_hits += 1
        group.append(plan)

    unique_plans = [group[0] for group in stage.translation_groups.values()]

    # Primary localization calls bound both source work and item count. A response may be
    # partial; retryable unresolved keys get one bounded repair batch. Timeout failures
    # are omitted safely instead of consuming another slow CPU inference call.
    primary_batches = _localization_batches(
        unique_plans, policy.chunk_size, policy.max_source_chars
    )
    for batch_index, batch in enumerate(primary_batches):
        if runtime.provider_call_count >= runtime.limits.max_provider_calls:
            mark("provider_call_cap")
            for target in (
                item for remaining in primary_batches[batch_index:] for item in remaining
            ):
                key = target.get("key")
                if isinstance(key, str):
                    pending[key] = target
                    failure_reasons[key] = "provider_call_cap"
            break
        if runtime.clock() >= total_deadline:
            mark("provider_deadline")
            for target in (
                item for remaining in primary_batches[batch_index:] for item in remaining
            ):
                key = target.get("key")
                if isinstance(key, str):
                    pending[key] = target
                    failure_reasons[key] = "provider_deadline"
            break
        stage.process_localization_batch(batch, retry=False)

    repair_calls = 0
    pending_plans = [
        target
        for target in pending.values()
        if failure_reasons.get(str(target.get("key"))) not in policy.non_retryable_failures
    ]
    for repair_batch in _localization_batches(
        pending_plans, policy.repair_chunk_size, policy.max_source_chars
    ):
        if repair_calls >= policy.max_repair_calls:
            break
        if runtime.provider_call_count >= runtime.limits.max_provider_calls:
            mark("provider_call_cap")
            break
        if runtime.clock() >= total_deadline:
            mark("provider_deadline")
            break
        reasons = {
            key: failure_reasons.get(key, "localization_missing")
            for target in repair_batch
            if isinstance((key := target.get("key")), str)
        }
        stage.process_localization_batch(repair_batch, retry=True, retry_reasons=reasons)
        repair_calls += 1
        for key in tuple(pending):
            if key in accepted_plan_keys:
                pending.pop(key, None)
                failure_reasons.pop(key, None)

    # Failed translations are omitted safely. Only canonical/same-locale values are copied by
    # `_localized_field`; no opposite-locale filler is introduced after bounded repairs.
    final_unresolved_localization = _localization_targets(request, localized_fields)
    if final_unresolved_localization:
        warnings.append(_PROVIDER_WARNING)
    for target in final_unresolved_localization:
        target_section = target.get("section")
        target_source_index = target.get("source_index")
        target_field = target.get("field")
        if (
            isinstance(target_section, str)
            and isinstance(target_source_index, int)
            and isinstance(target_field, str)
        ):
            mark("localization_missing")
            label = _plan_label(target_section, target_source_index, target_field)
            target_key = _localization_target_key(target_section, target_source_index, target_field)
            if not any(detail.startswith(f"{label}:") for detail in localization_failure_details):
                _record_scalar_failure(
                    runtime,
                    localization_failure_details,
                    label,
                    failure_reasons.get(target_key, "unresolved"),
                )
        else:
            mark("localization_target_rejection")
    if final_unresolved_localization:
        warnings.append(_LOCALIZATION_WARNING)
    return LocalizationResult(
        fields=localized_fields,
        provider_used=stage.provider_used,
        cache_hits=cache_hits,
        target_count=len(plans),
        unique_target_count=len(unique_plans),
        repair_calls=repair_calls,
        unresolved_count=len(final_unresolved_localization),
        failure_details=localization_failure_details,
    )
