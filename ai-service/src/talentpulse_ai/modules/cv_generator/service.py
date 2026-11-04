from __future__ import annotations

import re
from collections.abc import Sequence
from functools import partial
from time import monotonic

from pydantic import TypeAdapter, ValidationError

from talentpulse_ai.core.config import Settings
from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.modules.cv_generator.context_builder import _selected_entry_indices
from talentpulse_ai.modules.cv_generator.core_generation import generate_core
from talentpulse_ai.modules.cv_generator.draft_builder import build_draft
from talentpulse_ai.modules.cv_generator.localization import LocalizationPolicy, localize_fields
from talentpulse_ai.modules.cv_generator.provider_runtime import ProviderLimits, ProviderRuntime
from talentpulse_ai.modules.cv_generator.schemas import CvDraft, CvDraftRequest, ShortText
from talentpulse_ai.modules.cv_generator.validators import (
    _application_role,
    _target_skill_literal,
    _target_skill_pattern,
)
from talentpulse_ai.modules.rag_chatbot.schemas import GenerationProvider

# Async-worker defaults are deliberately separate from the shorter browser/NestJS
# request timeout. A warm CPU-only qwen3:4b six-item chunk measured about 36 seconds,
# while the richer core prompt took about 90 seconds. The configured per-call bounds
# leave headroom for that observed latency; the total deadline, chunk size, one repair
# pass, and provider-call cap keep work bounded. Failed provider timeouts are not retried.
_LOCALIZATION_CHUNK_SIZE = 6
# Six short labels are cheap; six full narratives are not. Keep source work bounded
# as well as item count so a local model can finish within the existing call timeout.
_LOCALIZATION_MAX_SOURCE_CHARS = 1500
_REPAIR_CHUNK_SIZE = 6
_MAX_REPAIR_CALLS = 1
_MAX_PROVIDER_CALLS = 12
_CORE_CALL_TIMEOUT_SECONDS = 120.0
_PRIMARY_CALL_TIMEOUT_SECONDS = 45.0
_REPAIR_CALL_TIMEOUT_SECONDS = 45.0
_LOCALIZATION_NUM_PREDICT = 256
_CV_TOTAL_TIMEOUT_SECONDS = 600.0
_NON_RETRYABLE_LOCALIZATION_FAILURES = frozenset(
    {"provider_timeout", "provider_deadline", "provider_call_cap"}
)
_APPLICATION_HEADING_ADAPTER: TypeAdapter[str] = TypeAdapter(ShortText)


def _target_priority(
    required_patterns: Sequence[tuple[str, re.Pattern[str]]],
    preferred_patterns: Sequence[tuple[str, re.Pattern[str]]],
    text: str,
    own_terms: Sequence[str] | None = None,
) -> tuple[int, int]:
    # Stable ordering of existing grounded facts, not a generated suitability score.
    return (
        -sum(
            bool(pattern.search(text))
            for skill, pattern in required_patterns
            if own_terms is None or skill in own_terms
        ),
        -sum(
            bool(pattern.search(text))
            for skill, pattern in preferred_patterns
            if own_terms is None or skill in own_terms
        ),
    )


class CvDraftGenerationService:
    def __init__(self, provider: GenerationProvider, settings: Settings | None = None) -> None:
        self._provider = provider
        self._settings = settings
        self.last_metrics: dict[str, object] = {}

    def _budget_seconds(self) -> tuple[float, float, float, float]:
        if self._settings is None:
            return (
                _CV_TOTAL_TIMEOUT_SECONDS,
                _CORE_CALL_TIMEOUT_SECONDS,
                _PRIMARY_CALL_TIMEOUT_SECONDS,
                _REPAIR_CALL_TIMEOUT_SECONDS,
            )
        return (
            self._settings.cv_generation_total_timeout_seconds,
            self._settings.cv_generation_core_timeout_seconds,
            self._settings.cv_generation_chunk_timeout_seconds,
            self._settings.cv_generation_repair_timeout_seconds,
        )

    def _record_metrics(self, metrics: dict[str, object]) -> None:
        # Publish at the original point, before final response validation can fail.
        self.last_metrics = metrics

    def generate(self, request: CvDraftRequest) -> CvDraft:
        clock = monotonic
        started_at = clock()
        selected_experience, selected_projects = _selected_entry_indices(request)
        application_role = _application_role(request)
        application_heading = None
        if application_role is not None:
            prefix = (
                "Ứng tuyển: " if request.locale.casefold().startswith("vi") else "Applying for: "
            )
            try:
                application_heading = _APPLICATION_HEADING_ADAPTER.validate_python(
                    prefix + application_role
                )
            except ValidationError:
                raise ServiceError(
                    "invalid_cv_request",
                    "Application heading exceeds the 500-character limit.",
                    422,
                ) from None
        (
            total_timeout_seconds,
            core_timeout_seconds,
            chunk_timeout_seconds,
            repair_timeout_seconds,
        ) = self._budget_seconds()
        runtime = ProviderRuntime(
            provider=self._provider,
            limits=ProviderLimits(
                total_timeout_seconds=total_timeout_seconds,
                core_timeout_seconds=core_timeout_seconds,
                chunk_timeout_seconds=chunk_timeout_seconds,
                repair_timeout_seconds=repair_timeout_seconds,
                max_provider_calls=_MAX_PROVIDER_CALLS,
            ),
            clock=clock,
            started_at=started_at,
        )
        localization_policy = LocalizationPolicy(
            chunk_size=_LOCALIZATION_CHUNK_SIZE,
            max_source_chars=_LOCALIZATION_MAX_SOURCE_CHARS,
            repair_chunk_size=_REPAIR_CHUNK_SIZE,
            max_repair_calls=_MAX_REPAIR_CALLS,
            num_predict=_LOCALIZATION_NUM_PREDICT,
            non_retryable_failures=_NON_RETRYABLE_LOCALIZATION_FAILURES,
        )
        required_patterns = [
            (_target_skill_literal(skill), re.compile(_target_skill_pattern(skill), re.IGNORECASE))
            for skill in dict.fromkeys(request.job.required_skills)
        ]
        preferred_patterns = [
            (_target_skill_literal(skill), re.compile(_target_skill_pattern(skill), re.IGNORECASE))
            for skill in dict.fromkeys(request.job.preferred_skills)
        ]

        target_priority = partial(_target_priority, required_patterns, preferred_patterns)

        warnings: list[str] = []
        provider_warnings: list[str] = []
        core = generate_core(
            request,
            selected_experience,
            selected_projects,
            runtime,
            target_priority,
            warnings,
            provider_warnings,
        )
        localization = localize_fields(request, runtime, localization_policy, warnings)
        return build_draft(
            request,
            selected_experience,
            selected_projects,
            application_role,
            application_heading,
            core,
            localization,
            runtime,
            target_priority,
            warnings,
            provider_warnings,
            localization_policy.chunk_size,
            self._record_metrics,
        )
