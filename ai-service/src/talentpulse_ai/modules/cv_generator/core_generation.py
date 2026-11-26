from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

from pydantic import BaseModel

from talentpulse_ai.core.logging import _LOGGER
from talentpulse_ai.modules.cv_generator.context_builder import (
    _entry_target_terms,
    _localization_targets,
    _shape_bullet,
)
from talentpulse_ai.modules.cv_generator.prompt_builder import render_cv_draft_prompt
from talentpulse_ai.modules.cv_generator.provider_runtime import (
    ProviderRuntime,
    _is_timeout_exception,
)
from talentpulse_ai.modules.cv_generator.schemas import CvDraftRequest, ProviderCoreDraft
from talentpulse_ai.modules.cv_generator.validators import (
    _dedupe_texts,
    _entry_has_evidence,
    _grounding_rejection_reason,
    _is_generic_bullet,
    _is_grounded,
    _locale_literals,
    _project_narrative_rejection,
    _salient_anchors,
)

TargetPriority = Callable[[str, Sequence[str] | None], tuple[int, int]]
_GROUNDED_WARNING = (
    "AI text was omitted because it could not be grounded in the supplied candidate or job facts."
)
_PROVIDER_WARNING = (
    "AI structured output was unavailable or invalid; the draft contains "
    "candidate-provided facts only."
)
_CORE_PROVIDER_OUTPUT_FIELDS = frozenset({"bullets", "project_bullets", "coverage", "warnings"})


@dataclass
class CoreGenerationResult:
    bullets_by_experience: dict[int, list[str]]
    bullets_by_project: dict[int, list[str]]
    provider_used: bool


def _validate_provider_model[ModelT: BaseModel](raw: object, model: type[ModelT]) -> ModelT:
    """Validate core structured output while tolerating legacy core-only extras."""
    try:
        return model.model_validate(raw)
    except Exception:
        if model is not ProviderCoreDraft or not isinstance(raw, Mapping):
            raise
        extras = set(raw).difference(model.model_fields)
        if not extras or not extras.issubset(_CORE_PROVIDER_OUTPUT_FIELDS):
            raise
        return model.model_validate(
            {key: value for key, value in raw.items() if key in model.model_fields}
        )


@dataclass
class _CoreAcceptance:
    request: CvDraftRequest
    runtime: ProviderRuntime
    warnings: list[str]
    result: CoreGenerationResult

    def accept(
        self,
        core: ProviderCoreDraft,
        *,
        experience_indices: set[int] | None = None,
        project_indices: set[int] | None = None,
    ) -> None:
        request = self.request
        mark = self.runtime.mark
        warnings = self.warnings
        bullets_by_experience = self.result.bullets_by_experience
        bullets_by_project = self.result.bullets_by_project
        for bullet in core.bullets:
            if experience_indices is not None and bullet.source_index not in experience_indices:
                continue
            if bullet.source_index >= len(request.candidate.experience):
                mark("grounding_anchor_rejection")
                warnings.append(_GROUNDED_WARNING)
                continue
            source = request.candidate.experience[bullet.source_index]
            if not _entry_has_evidence(source):
                mark("grounding_anchor_rejection")
                warnings.append(_GROUNDED_WARNING)
                continue
            source_evidence = [
                value for value in source.model_dump().values() if isinstance(value, str)
            ]
            if _is_generic_bullet(bullet.text):
                mark("grounding_anchor_rejection")
                warnings.append(_GROUNDED_WARNING)
                continue
            rejection = _grounding_rejection_reason(
                bullet.text,
                source_evidence,
                locale=request.locale,
                preserved_literals=_locale_literals(request.candidate),
            )
            if rejection is not None:
                mark(rejection)
                warnings.append(_GROUNDED_WARNING)
                continue
            accepted = _dedupe_texts(
                (
                    item
                    for item in _shape_bullet(bullet.text)
                    if _is_grounded(
                        item,
                        source_evidence,
                        locale=request.locale,
                        preserved_literals=_locale_literals(request.candidate),
                    )
                ),
                exclude=[source.description or ""],
                limit=10,
            )
            if accepted:
                bullets_by_experience.setdefault(bullet.source_index, []).extend(accepted)
                self.result.provider_used = True

        for project_bullet in core.project_bullets:
            if project_indices is not None and project_bullet.source_index not in project_indices:
                continue
            if project_bullet.source_index >= len(request.candidate.projects):
                mark("grounding_anchor_rejection")
                warnings.append(_GROUNDED_WARNING)
                continue
            project_source = request.candidate.projects[project_bullet.source_index]
            if not _entry_has_evidence(project_source):
                mark("grounding_anchor_rejection")
                warnings.append(_GROUNDED_WARNING)
                continue
            source_evidence = [
                value for value in project_source.model_dump().values() if isinstance(value, str)
            ] + project_source.technologies
            if _is_generic_bullet(project_bullet.text) or (
                not request.locale.casefold().startswith("vi")
                and _project_narrative_rejection(project_bullet.text, project_source) is not None
            ):
                mark("grounding_anchor_rejection")
                warnings.append(_GROUNDED_WARNING)
                continue
            rejection = _grounding_rejection_reason(
                project_bullet.text,
                source_evidence,
                locale=request.locale,
                preserved_literals=_locale_literals(request.candidate),
            )
            if rejection is not None:
                mark(rejection)
                warnings.append(_GROUNDED_WARNING)
                continue
            accepted = _dedupe_texts(
                (
                    item
                    for item in _shape_bullet(project_bullet.text)
                    if _is_grounded(
                        item,
                        source_evidence,
                        locale=request.locale,
                        preserved_literals=_locale_literals(request.candidate),
                    )
                ),
                exclude=[project_source.description or ""],
                limit=10,
            )
            if accepted:
                bullets_by_project.setdefault(project_bullet.source_index, []).extend(accepted)
                self.result.provider_used = True


def _provider_warning_values(model: BaseModel) -> list[str]:
    raw = getattr(model, "warnings", [])
    if not isinstance(raw, list):
        return []
    # Providers may supply review notes, never application-owned status markers.
    return [
        value
        for value in raw
        if isinstance(value, str) and "cv_generation." not in value.casefold()
    ]


def _validate_core_payload(
    raw: object,
    experience_indices: Sequence[int] = (),
    project_indices: Sequence[int] = (),
) -> ProviderCoreDraft:
    try:
        return _validate_provider_model(raw, ProviderCoreDraft)
    except Exception:
        if not isinstance(raw, Mapping):
            raise
        coerced = dict(raw)
        if isinstance(coerced.get("bullets"), list) and len(experience_indices) == 1:
            values = coerced["bullets"]
            if all(isinstance(value, str) for value in values):
                coerced["bullets"] = [
                    {"source_index": experience_indices[0], "text": value} for value in values
                ]
        if isinstance(coerced.get("project_bullets"), list) and len(project_indices) == 1:
            values = coerced["project_bullets"]
            if all(isinstance(value, str) for value in values):
                coerced["project_bullets"] = [
                    {"source_index": project_indices[0], "text": value} for value in values
                ]
        return _validate_provider_model(coerced, ProviderCoreDraft)


def generate_core(
    request: CvDraftRequest,
    selected_experience: Sequence[int],
    selected_projects: Sequence[int],
    runtime: ProviderRuntime,
    target_priority: TargetPriority,
    warnings: list[str],
    provider_warnings: list[str],
) -> CoreGenerationResult:
    mark = runtime.mark
    invoke = runtime.invoke
    total_deadline = runtime.total_deadline

    bullets_by_experience: dict[int, list[str]] = {}
    bullets_by_project: dict[int, list[str]] = {}
    result = CoreGenerationResult(bullets_by_experience, bullets_by_project, False)
    acceptance = _CoreAcceptance(request, runtime, warnings, result)

    # Core generation is one small structured call.  It never carries the
    # localization object, so Qwen can focus on complete rich bullets.
    core_indices_experience = {
        index
        for index, item in enumerate(request.candidate.experience)
        if index in selected_experience and _entry_has_evidence(item)
    }
    core_indices_projects = {
        index
        for index, item in enumerate(request.candidate.projects)
        if index in selected_projects and _entry_has_evidence(item)
    }
    core: ProviderCoreDraft | None = None
    if core_indices_experience or core_indices_projects:
        try:
            core = _validate_core_payload(
                invoke(
                    render_cv_draft_prompt(request),
                    ProviderCoreDraft.model_json_schema(),
                    deadline=total_deadline,
                    timeout=runtime.limits.core_timeout_seconds,
                    call_kind="core",
                ),
                tuple(sorted(core_indices_experience)),
                tuple(sorted(core_indices_projects)),
            )
            provider_warnings.extend(_provider_warning_values(core))
            acceptance.accept(core)
        except Exception as exc:
            error_method = getattr(exc, "errors", None)
            validation_paths: list[str] = []
            if callable(error_method):
                validation_failed = True
                validation_paths = [
                    ".".join(str(part) for part in error.get("loc", ())) for error in error_method()
                ]
            else:
                validation_failed = False
            if validation_failed:
                mark("schema_validation")
            elif _is_timeout_exception(exc):
                mark("provider_timeout")
            else:
                mark("provider_exception")
            _LOGGER.warning(
                "cv_generation_core_failed request_id=%s trace_id=%s model=%s "
                "exception_class=%s validation_failed=%s failure_reason=%s "
                "validation_paths=%s",
                request.identity.request_id,
                request.identity.trace_id,
                getattr(
                    runtime.provider, "model_name", getattr(runtime.provider, "_model", "unknown")
                ),
                type(exc).__name__,
                validation_failed,
                (
                    "provider_validation_error"
                    if validation_failed
                    else "provider_timeout"
                    if _is_timeout_exception(exc)
                    else "provider_exception"
                ),
                validation_paths,
            )
            warnings.append(_PROVIDER_WARNING)

    # Repair partial successful output before fallback can hide missing provider entries.
    # A failed/timed-out core call is not retried with another slow inference call.
    missing_experience = sorted(core_indices_experience - bullets_by_experience.keys())
    missing_projects = sorted(core_indices_projects - bullets_by_project.keys())
    if missing_experience or missing_projects:
        mark("missing_provider_item", len(missing_experience) + len(missing_projects))
    # Reorder valid owning facts before deciding whether a single repair is needed.
    for index, bullets in bullets_by_experience.items():
        own_terms = _entry_target_terms(request, request.candidate.experience[index])
        bullets.sort(key=lambda text: target_priority(text, own_terms))
    for index, bullets in bullets_by_project.items():
        own_terms = _entry_target_terms(request, request.candidate.projects[index])
        bullets.sort(key=lambda text: target_priority(text, own_terms))
    focus_experience = [
        index
        for index in sorted(core_indices_experience)
        if index not in missing_experience
        and (
            (
                bool(own_terms := _entry_target_terms(request, request.candidate.experience[index]))
                and target_priority(bullets_by_experience[index][0], own_terms) == (0, 0)
            )
            or not _salient_anchors(request.candidate.experience[index].description or "").issubset(
                _salient_anchors(" ".join(bullets_by_experience[index]))
            )
        )
    ]
    focus_projects = [
        index
        for index in sorted(core_indices_projects)
        if index not in missing_projects
        and (
            (
                bool(own_terms := _entry_target_terms(request, request.candidate.projects[index]))
                and target_priority(bullets_by_project[index][0], own_terms) == (0, 0)
            )
            or not _salient_anchors(request.candidate.projects[index].description or "").issubset(
                _salient_anchors(" ".join(bullets_by_project[index]))
            )
        )
    ]
    # A localized description is already shaped into project bullets below.
    # Do not spend another inference call rewriting that same rich source first.
    project_translation_indices = {
        target["source_index"]
        for target in _localization_targets(request, {})
        if target["section"] == "projects" and target["field"] == "description"
    }
    repair_entries: list[tuple[list[int], list[int]]] = [
        ([index], []) for index in [*missing_experience, *focus_experience]
    ] + [
        ([], [index])
        for index in [*missing_projects, *focus_projects]
        if index not in project_translation_indices
    ]
    for experience_indices, project_indices in repair_entries:
        if core is None or runtime.provider_call_count >= runtime.limits.max_provider_calls:
            break
        if runtime.clock() >= total_deadline:
            break
        # One bounded attempt per entry avoids a small model borrowing another entry's
        # source index. Grammar and application checks both retain the original index.
        repair_schema = ProviderCoreDraft.model_json_schema()
        repair_schema["properties"] = {
            key: repair_schema["properties"][key] for key in ("bullets", "project_bullets")
        }
        repair_schema["$defs"] = {
            key: repair_schema["$defs"][key]
            for key in ("GeneratedBullet", "GeneratedProjectBullet")
        }
        repair_schema["required"] = ["bullets", "project_bullets"]
        for repair_field, definition, indices in (
            ("bullets", "GeneratedBullet", experience_indices),
            ("project_bullets", "GeneratedProjectBullet", project_indices),
        ):
            if indices:
                index_schema = repair_schema["$defs"][definition]["properties"]["source_index"]
                index_schema["enum"] = indices
                repair_schema["properties"][repair_field]["minItems"] = 1
                repair_schema["properties"][repair_field]["maxItems"] = 3
                repair_schema["$defs"][definition]["properties"]["text"]["maxLength"] = 250
            else:
                repair_schema["properties"][repair_field]["maxItems"] = 0
        try:
            repaired_core = _validate_core_payload(
                invoke(
                    render_cv_draft_prompt(
                        request,
                        experience_indices=experience_indices,
                        project_indices=project_indices,
                    ),
                    repair_schema,
                    deadline=total_deadline,
                    timeout=runtime.limits.repair_timeout_seconds,
                    call_kind="core_repair",
                    num_predict=768,
                ),
                experience_indices,
                project_indices,
            )
            acceptance.accept(
                repaired_core,
                experience_indices=set(experience_indices),
                project_indices=set(project_indices),
            )
        except Exception as exc:
            mark("provider_timeout" if _is_timeout_exception(exc) else "core_repair_failure")
            warnings.append(_PROVIDER_WARNING)
            if _is_timeout_exception(exc):
                break
    return result
