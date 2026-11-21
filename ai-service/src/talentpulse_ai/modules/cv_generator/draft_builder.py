from __future__ import annotations

import re
from collections.abc import Callable, Sequence

from talentpulse_ai.core.logging import _LOGGER
from talentpulse_ai.modules.cv_generator.context_builder import (
    _entry_target_terms,
    _fallback_bullets,
    _fallback_objective,
    _group_skills,
    _localized_field,
    _localized_text_list,
    _shape_bullet,
    _split_clauses,
)
from talentpulse_ai.modules.cv_generator.core_generation import CoreGenerationResult, TargetPriority
from talentpulse_ai.modules.cv_generator.localization import LocalizationResult
from talentpulse_ai.modules.cv_generator.provider_runtime import ProviderRuntime
from talentpulse_ai.modules.cv_generator.schemas import (
    CandidateEducation,
    CandidateExperience,
    CandidateProject,
    CvDraft,
    CvDraftRequest,
    DraftExperience,
    DraftProject,
)
from talentpulse_ai.modules.cv_generator.validators import (
    _RESPONSIBILITY_ACTION_RE,
    _dedupe_texts,
    _entry_has_evidence,
    _is_generic_bullet,
    _is_grounded,
    _locale_literals,
    _salient_anchors,
    _skill_member_display,
    _skill_member_is_relevant,
    _source_localization_evidence,
    _stable_source_text,
    _target_skill_literal,
    _target_skill_pattern,
)

_FALLBACK_WARNING = "Deterministic fallback bullets were used; review wording before publishing."
_INSUFFICIENT_EVIDENCE_WARNING = (
    "Insufficient source evidence for a responsibility bullet; "
    "only factual source details were retained."
)
_RICH_OMISSION_WARNING = (
    "Some rich source content was omitted because targeted translation or rewriting "
    "could not be grounded; edit the draft or retry generation."
)
_OBJECTIVE_OMISSION_WARNING = (
    "Career objective was omitted because a grounded translation was unavailable; "
    "edit the draft or retry generation."
)
_PROVIDER_PROVENANCE = "cv_generation.provenance=provider"
_FALLBACK_PROVENANCE = "cv_generation.provenance=fallback"
_LOCALIZATION_PROVENANCE = "cv_generation.localization=provider"


def _missing_indices(
    request: CvDraftRequest,
    selected_experience: Sequence[int],
    selected_projects: Sequence[int],
    bullets_by_experience: dict[int, list[str]],
    bullets_by_project: dict[int, list[str]],
) -> tuple[list[int], list[int]]:
    return (
        [
            index
            for index, item in enumerate(request.candidate.experience)
            if index in selected_experience
            and _entry_has_evidence(item)
            and not bullets_by_experience.get(index)
        ],
        [
            index
            for index, item in enumerate(request.candidate.projects)
            if index in selected_projects
            and _entry_has_evidence(item)
            and not bullets_by_project.get(index)
        ],
    )


def _add_review_path(
    origins: dict[str, str],
    source_refs: dict[str, list[str]],
    path: str,
    origin: str,
    references: Sequence[str],
) -> None:
    unique_references = list(dict.fromkeys(references))
    if unique_references:
        origins[path] = origin
        source_refs[path] = unique_references


def _omit_review_path(
    origins: dict[str, str],
    source_refs: dict[str, list[str]],
    omissions: list[dict[str, str]],
    path: str,
    reason: str,
    references: Sequence[str],
) -> None:
    if path in origins or any(item["path"] == path for item in omissions):
        return
    unique_references = list(dict.fromkeys(references))
    if unique_references:
        source_refs[path] = unique_references
        omissions.append({"path": path, "reason_code": reason})


def _review_origin_for(
    localization: LocalizationResult, section: str, index: int, field: str
) -> str:
    return "LOCALIZED" if (section, index, field) in localization.fields else "SOURCE"


def _review_metadata_for_draft(
    request: CvDraftRequest,
    draft: CvDraft,
    core: CoreGenerationResult,
    localization: LocalizationResult,
    *,
    application_role: str | None,
    fallback_bullets_by_experience: dict[int, set[str]],
    fallback_bullets_by_project: dict[int, set[str]],
    localized_bullets_by_experience: dict[int, set[str]],
    localized_bullets_by_project: dict[int, set[str]],
    objective_omitted: bool,
    remaining_experience: Sequence[int],
    remaining_projects: Sequence[int],
) -> dict[str, object]:
    origins: dict[str, str] = {}
    source_refs: dict[str, list[str]] = {}
    omissions: list[dict[str, str]] = []

    if draft.position is not None:
        source_path = "/job/title" if application_role else "/candidate/headline"
        _add_review_path(
            origins,
            source_refs,
            "/position",
            "LOCALIZED"
            if not application_role and ("headline", 0, "headline") in localization.fields
            else "SOURCE",
            [source_path],
        )

    if draft.career_objective is not None:
        objective_refs = (
            ["/candidate/career_objective"]
            if request.candidate.career_objective
            else [f"/candidate/skills/{index}" for index in range(len(request.candidate.skills))]
        )
        if (
            request.candidate.career_objective
            and (
                "objective",
                0,
                "career_objective",
            )
            in localization.fields
        ):
            objective_origin = "LOCALIZED"
        elif not request.candidate.career_objective:
            objective_origin = "FALLBACK"
        else:
            objective_origin = "SOURCE"
        if application_role:
            objective_refs.extend(["/job/title"])
        _add_review_path(
            origins, source_refs, "/career_objective", objective_origin, objective_refs
        )
    elif objective_omitted and request.candidate.career_objective:
        _omit_review_path(
            origins,
            source_refs,
            omissions,
            "/career_objective",
            "LOCALIZATION_FAILED",
            ["/candidate/career_objective"],
        )

    education_fields = ("school_name", "degree", "major", "start_date", "end_date", "description")
    for index, education_entry in enumerate(draft.education):
        for field_name in education_fields:
            value = getattr(education_entry, field_name)
            if value is None:
                continue
            education_path = f"/education/{index}/{field_name}"
            _add_review_path(
                origins,
                source_refs,
                education_path,
                _review_origin_for(localization, "education", index, field_name),
                [f"/candidate/education/{index}/{field_name}"],
            )

    experience_fields = ("company_name", "position", "start_date", "end_date", "description")
    for output_index, experience_entry in enumerate(draft.work_experience):
        source_index = experience_entry.source_index
        for field_name in experience_fields:
            if getattr(experience_entry, field_name) is None:
                continue
            experience_path = f"/work_experience/{output_index}/{field_name}"
            _add_review_path(
                origins,
                source_refs,
                experience_path,
                _review_origin_for(localization, "experience", source_index, field_name),
                [f"/candidate/experience/{source_index}/{field_name}"],
            )
        for bullet_index, bullet in enumerate(experience_entry.bullets):
            if bullet in core.provider_bullets_by_experience.get(source_index, set()):
                origin = "AI_SUGGESTED"
            elif bullet in localized_bullets_by_experience.get(source_index, set()):
                origin = "LOCALIZED"
            elif bullet in fallback_bullets_by_experience.get(source_index, set()):
                origin = "FALLBACK"
            else:
                origin = "SOURCE"
            _add_review_path(
                origins,
                source_refs,
                f"/work_experience/{output_index}/bullets/{bullet_index}",
                origin,
                [f"/candidate/experience/{source_index}"],
            )

    project_fields = (
        "project_name",
        "role",
        "start_date",
        "end_date",
        "description",
    )
    for output_index, project_entry in enumerate(draft.projects):
        source_index = project_entry.source_index
        for field_name in project_fields:
            if getattr(project_entry, field_name) is None:
                continue
            project_path = f"/projects/{output_index}/{field_name}"
            _add_review_path(
                origins,
                source_refs,
                project_path,
                _review_origin_for(localization, "projects", source_index, field_name),
                [f"/candidate/projects/{source_index}/{field_name}"],
            )
        for technology_index, _technology in enumerate(project_entry.technologies):
            _add_review_path(
                origins,
                source_refs,
                f"/projects/{output_index}/technologies/{technology_index}",
                "SOURCE",
                [f"/candidate/projects/{source_index}/technologies"],
            )
        for bullet_index, bullet in enumerate(project_entry.bullets):
            if bullet in core.provider_bullets_by_project.get(source_index, set()):
                origin = "AI_SUGGESTED"
            elif bullet in localized_bullets_by_project.get(source_index, set()):
                origin = "LOCALIZED"
            elif bullet in fallback_bullets_by_project.get(source_index, set()):
                origin = "FALLBACK"
            else:
                origin = "SOURCE"
            _add_review_path(
                origins,
                source_refs,
                f"/projects/{output_index}/bullets/{bullet_index}",
                origin,
                [f"/candidate/projects/{source_index}"],
            )

    for output_index, skill in enumerate(draft.skills):
        matched_skill_indices = [
            index
            for index, source in enumerate(request.candidate.skills)
            if (display := _skill_member_display(request, source)) is not None
            and skill.description is not None
            and display in skill.description.split("; ")
        ]
        skill_references = [f"/candidate/skills/{index}" for index in matched_skill_indices]
        for index, certificate in enumerate(request.candidate.certificates):
            if skill.description and certificate in skill.description.split("; "):
                skill_references.append(f"/candidate/certificates/{index}")
        _add_review_path(
            origins, source_refs, f"/skills/{output_index}/name", "LOCALIZED", skill_references
        )
        if skill.description is not None:
            localized = any(
                _skill_member_display(request, request.candidate.skills[index])
                != request.candidate.skills[index]
                for index in matched_skill_indices
            )
            _add_review_path(
                origins,
                source_refs,
                f"/skills/{output_index}/description",
                "LOCALIZED" if localized else "SOURCE",
                skill_references,
            )

    for output_section, source_section, output_values, source_values in (
        ("activities", "activities", draft.activities, request.candidate.activities),
        ("certificates", "certificates", draft.certificates, request.candidate.certificates),
        ("awards", "awards", draft.awards, request.candidate.awards),
    ):
        for output_index, value in enumerate(output_values):
            matching_indices = [
                index
                for index, source in enumerate(source_values)
                if value == source
                or localization.fields.get((source_section, index, "text")) == value
            ]
            localized = any(
                localization.fields.get((source_section, index, "text")) == value
                and source_values[index] != value
                for index in matching_indices
            )
            _add_review_path(
                origins,
                source_refs,
                f"/{output_section}/{output_index}",
                "LOCALIZED" if localized else "SOURCE",
                [f"/candidate/{source_section}/{index}" for index in matching_indices],
            )

    experience_output_indices = {
        entry.source_index: index for index, entry in enumerate(draft.work_experience)
    }
    for source_index in remaining_experience:
        omitted_output_index = experience_output_indices.get(source_index)
        if omitted_output_index is not None:
            _omit_review_path(
                origins,
                source_refs,
                omissions,
                f"/work_experience/{omitted_output_index}/bullets",
                "INSUFFICIENT_EVIDENCE",
                [f"/candidate/experience/{source_index}"],
            )
    project_output_indices = {
        entry.source_index: index for index, entry in enumerate(draft.projects)
    }
    for source_index in remaining_projects:
        omitted_project_index = project_output_indices.get(source_index)
        if omitted_project_index is not None:
            _omit_review_path(
                origins,
                source_refs,
                omissions,
                f"/projects/{omitted_project_index}/bullets",
                "INSUFFICIENT_EVIDENCE",
                [f"/candidate/projects/{source_index}"],
            )

    for target in localization.unresolved_targets:
        unresolved_section = target.get("section")
        unresolved_source_index = target.get("source_index")
        unresolved_field = target.get("field")
        if (
            not isinstance(unresolved_section, str)
            or type(unresolved_source_index) is not int
            or not isinstance(unresolved_field, str)
        ):
            continue
        omission_path: str | None = None
        omission_source_path: str | None = None
        if unresolved_section == "objective":
            omission_path, omission_source_path = (
                "/career_objective",
                "/candidate/career_objective",
            )
        elif unresolved_section == "headline":
            omission_path, omission_source_path = "/position", "/candidate/headline"
        elif unresolved_section == "education":
            omission_path = f"/education/{unresolved_source_index}/{unresolved_field}"
            omission_source_path = (
                f"/candidate/education/{unresolved_source_index}/{unresolved_field}"
            )
        elif unresolved_section == "experience":
            unresolved_experience_index = experience_output_indices.get(unresolved_source_index)
            if unresolved_experience_index is not None:
                omission_path = f"/work_experience/{unresolved_experience_index}/{unresolved_field}"
                omission_source_path = (
                    f"/candidate/experience/{unresolved_source_index}/{unresolved_field}"
                )
        elif unresolved_section == "projects":
            unresolved_project_index = project_output_indices.get(unresolved_source_index)
            if unresolved_project_index is not None:
                omission_path = f"/projects/{unresolved_project_index}/{unresolved_field}"
                omission_source_path = (
                    f"/candidate/projects/{unresolved_source_index}/{unresolved_field}"
                )
        elif unresolved_section in {"activities", "certificates", "awards"}:
            output_section = unresolved_section
            output_values = getattr(draft, output_section)
            omission_path = (
                f"/{output_section}/{min(unresolved_source_index, max(0, len(output_values)))}"
            )
            omission_source_path = f"/candidate/{unresolved_section}/{unresolved_source_index}"
        elif unresolved_section == "skills":
            omission_path = f"/skills/{unresolved_source_index}/description"
            omission_source_path = f"/candidate/skills/{unresolved_source_index}"
        if omission_path is not None and omission_source_path is not None:
            _omit_review_path(
                origins,
                source_refs,
                omissions,
                omission_path,
                "LOCALIZATION_FAILED",
                [omission_source_path],
            )

    return {
        "source_refs_by_path": source_refs,
        "field_origins_by_path": origins,
        "omissions_by_path": omissions,
    }


def build_draft(
    request: CvDraftRequest,
    selected_experience: Sequence[int],
    selected_projects: Sequence[int],
    application_role: str | None,
    application_heading: str | None,
    core: CoreGenerationResult,
    localization: LocalizationResult,
    runtime: ProviderRuntime,
    target_priority: TargetPriority,
    warnings: list[str],
    provider_warnings: list[str],
    localization_chunk_size: int,
    record_metrics: Callable[[dict[str, object]], None],
    review_metadata: dict[str, object] | None = None,
) -> CvDraft:
    mark = runtime.mark
    diagnostics = runtime.diagnostics
    bullets_by_experience = core.bullets_by_experience
    bullets_by_project = core.bullets_by_project
    provider_used = core.provider_used
    fallback_used = False
    localized_fields = localization.fields
    fallback_bullets_by_experience: dict[int, set[str]] = {}
    fallback_bullets_by_project: dict[int, set[str]] = {}
    localized_bullets_by_experience: dict[int, set[str]] = {}
    localized_bullets_by_project: dict[int, set[str]] = {}

    action_groups: tuple[
        tuple[str, Sequence[CandidateExperience | CandidateProject], dict[int, list[str]]], ...
    ] = (
        ("experience", request.candidate.experience, bullets_by_experience),
        ("projects", request.candidate.projects, bullets_by_project),
    )
    for section, sources, mapped in action_groups:
        for index, source in enumerate(sources):
            accepted = mapped.get(index, [])
            own_terms = _entry_target_terms(request, source)
            if not accepted or not own_terms:
                continue
            accepted.sort(key=lambda text: target_priority(text, own_terms))
            if target_priority(accepted[0], own_terms) != (0, 0):
                continue
            translated = localized_fields.get((section, index, "description"))
            for description, provider_action in (
                (translated, True),
                (source.description, False),
            ):
                selected = []
                for clause in _split_clauses(description or ""):
                    for action in _shape_bullet(clause):
                        if (
                            len(action) < 10
                            or _is_generic_bullet(action)
                            or target_priority(action, own_terms) == (0, 0)
                            or re.match(
                                r"^(?:skills?|technologies|tools|tech stack|"
                                r"kỹ năng|công nghệ)\b",
                                action,
                                re.IGNORECASE,
                            )
                            or not _RESPONSIBILITY_ACTION_RE.search(action)
                            or not _is_grounded(
                                action,
                                _source_localization_evidence(request, section, index),
                                locale=request.locale,
                                preserved_literals=_locale_literals(request.candidate),
                            )
                        ):
                            continue
                        selected.append(action)
                if selected:
                    selected = sorted(selected, key=lambda text: target_priority(text, own_terms))[
                        :1
                    ]
                    mapped[index] = [*selected, *accepted]
                    if provider_action:
                        provider_used = True
                        provider_bullets = (
                            core.provider_bullets_by_experience
                            if section == "experience"
                            else core.provider_bullets_by_project
                        )
                        provider_bullets.setdefault(index, set()).update(selected)
                        mark("target_focus_localized_action", len(selected))
                    else:
                        fallback_used = True
                        fallback_bullets = (
                            fallback_bullets_by_experience
                            if section == "experience"
                            else fallback_bullets_by_project
                        )
                        fallback_bullets.setdefault(index, set()).update(selected)
                        mark("target_focus_source_fallback", len(selected))
                    break

    # Same-locale source clauses can be safely shaped as deterministic bullets.
    # Opposite-locale rich prose is never replaced by generic filler.
    if not request.locale.casefold().startswith("vi"):
        for section, sources, mapped in action_groups:
            for index, source in enumerate(sources):
                selected_indices = (
                    selected_experience if section == "experience" else selected_projects
                )
                if index not in selected_indices:
                    continue
                translated = localized_fields.get((section, index, "description"))
                if not translated:
                    continue
                # Scalar translations have already passed locale, owning-entry
                # grounding and anchor-preservation validation. Reuse them even
                # when core output was partial, rather than losing source facts.
                translated_source = source.model_copy(update={"description": translated})
                enriched, _ = _fallback_bullets(
                    translated_source,
                    locale=request.locale,
                    kind="experience" if section == "experience" else "project",
                    preserved_literals=_locale_literals(request.candidate),
                )
                if enriched:
                    # Project translations preserve this entry's full narrative.
                    # Do not merge broader core claims that can borrow another
                    # project's responsibilities without introducing new anchors.
                    mapped[index] = (
                        enriched if section == "projects" else [*mapped.get(index, []), *enriched]
                    )
                    localized_bullets = (
                        localized_bullets_by_experience
                        if section == "experience"
                        else localized_bullets_by_project
                    )
                    localized_bullets.setdefault(index, set()).update(enriched)
                    provider_used = True

    for index, experience_source in enumerate(request.candidate.experience):
        if index not in selected_experience:
            continue
        if not bullets_by_experience.get(index):
            rewrites, insufficient = _fallback_bullets(
                experience_source,
                locale=request.locale,
                kind="experience",
                preserved_literals=_locale_literals(request.candidate),
            )
            if insufficient:
                warnings.append(_INSUFFICIENT_EVIDENCE_WARNING)
            if rewrites:
                bullets_by_experience[index] = rewrites[:4]
                fallback_bullets_by_experience.setdefault(index, set()).update(rewrites[:4])
                fallback_used = True
    for index, project_source in enumerate(request.candidate.projects):
        if index not in selected_projects:
            continue
        if not bullets_by_project.get(index):
            rewrites, insufficient = _fallback_bullets(
                project_source,
                locale=request.locale,
                kind="project",
                preserved_literals=_locale_literals(request.candidate),
            )
            if insufficient:
                warnings.append(_INSUFFICIENT_EVIDENCE_WARNING)
            if rewrites:
                bullets_by_project[index] = rewrites[:4]
                fallback_bullets_by_project.setdefault(index, set()).update(rewrites[:4])
                fallback_used = True

    for descriptions, mapped_bullets in (
        ([entry.description for entry in request.candidate.experience], bullets_by_experience),
        ([entry.description for entry in request.candidate.projects], bullets_by_project),
    ):
        for index, description in enumerate(descriptions):
            if index not in (
                selected_experience
                if mapped_bullets is bullets_by_experience
                else selected_projects
            ):
                continue
            missing_salient = _salient_anchors(description or "") - _salient_anchors(
                " ".join(mapped_bullets.get(index, []))
            )
            if not missing_salient:
                continue
            mark("missing_salient_anchor", len(missing_salient))
            source_bullets = [
                bullet
                for clause in _split_clauses(description or "")
                for bullet in _shape_bullet(clause)
                if _salient_anchors(bullet) & missing_salient
                and _is_grounded(
                    bullet,
                    [description or ""],
                    locale=request.locale,
                    preserved_literals=_locale_literals(request.candidate),
                )
            ]
            if source_bullets:
                # Keep salient source facts before the existing ten-bullet cap.
                mapped_bullets[index] = [*source_bullets, *mapped_bullets.get(index, [])]
                fallback_bullets = (
                    fallback_bullets_by_experience
                    if mapped_bullets is bullets_by_experience
                    else fallback_bullets_by_project
                )
                fallback_bullets.setdefault(index, set()).update(source_bullets)
                fallback_used = True
                mark("salient_anchor_fallback", len(source_bullets))

    bullets_by_experience = {
        key: sorted(
            _dedupe_texts(
                sorted(value, key=lambda text: not bool(_salient_anchors(text))), limit=10
            ),
            key=lambda text: target_priority(
                text, _entry_target_terms(request, request.candidate.experience[key])
            ),
        )
        for key, value in bullets_by_experience.items()
    }
    bullets_by_project = {
        key: sorted(
            _dedupe_texts(
                sorted(value, key=lambda text: not bool(_salient_anchors(text))), limit=10
            ),
            key=lambda text: target_priority(
                text, _entry_target_terms(request, request.candidate.projects[key])
            ),
        )
        for key, value in bullets_by_project.items()
    }
    remaining_experience, remaining_projects = _missing_indices(
        request,
        selected_experience,
        selected_projects,
        bullets_by_experience,
        bullets_by_project,
    )
    if remaining_experience or remaining_projects:
        omitted_count = len(remaining_experience) + len(remaining_projects)
        mark("repair_failure/omission", omitted_count)
        warnings.append(_RICH_OMISSION_WARNING)

    draft_projects: list[DraftProject] = []
    for index in selected_projects:
        project = request.candidate.projects[index]
        project_values = project.model_dump()
        project_name = _localized_field(
            request, localized_fields, "projects", index, "project_name"
        )
        project_values.update(
            {
                "project_name": project_name
                or (
                    f"Dự án {index + 1}"
                    if request.locale.casefold().startswith("vi")
                    else f"Project {index + 1}"
                ),
                "role": _localized_field(request, localized_fields, "projects", index, "role"),
                "description": _localized_field(
                    request, localized_fields, "projects", index, "description"
                ),
            }
        )
        draft_projects.append(
            DraftProject(
                **project_values, source_index=index, bullets=bullets_by_project.get(index, [])
            )
        )

    draft_experience: list[DraftExperience] = []
    for index in selected_experience:
        experience = request.candidate.experience[index]
        experience_values = experience.model_dump()
        experience_values.update(
            {
                "position": _localized_field(
                    request, localized_fields, "experience", index, "position"
                ),
                "description": _localized_field(
                    request, localized_fields, "experience", index, "description"
                ),
            }
        )
        draft_experience.append(
            DraftExperience(
                **experience_values,
                source_index=index,
                bullets=bullets_by_experience.get(index, []),
            )
        )

    localized_education: list[CandidateEducation] = []
    for index, education in enumerate(request.candidate.education):
        education_values = education.model_dump()
        education_values.update(
            {
                "degree": _localized_field(request, localized_fields, "education", index, "degree"),
                "major": _localized_field(request, localized_fields, "education", index, "major"),
                "description": _localized_field(
                    request, localized_fields, "education", index, "description"
                ),
            }
        )
        localized_education.append(CandidateEducation(**education_values))

    objective_value = _localized_field(
        request, localized_fields, "objective", 0, "career_objective"
    ) or _fallback_objective(request.candidate, request.locale)
    objective_omitted = bool(request.candidate.career_objective and not objective_value)
    if objective_omitted:
        warnings.append(_OBJECTIVE_OMISSION_WARNING)
    if provider_used:
        warnings.append(_PROVIDER_PROVENANCE)
    if localization.provider_used:
        warnings.append(_LOCALIZATION_PROVENANCE)
    if fallback_used:
        _LOGGER.warning(
            "cv_generation_fallback request_id=%s trace_id=%s model=%s fallback_reason=%s",
            request.identity.request_id,
            request.identity.trace_id,
            getattr(runtime.provider, "model_name", getattr(runtime.provider, "_model", "unknown")),
            (
                "salient_anchor_supplementation"
                if provider_used and diagnostics["salient_anchor_fallback"]
                else "partial_grounded_provider_bullets"
                if provider_used
                else "no_grounded_provider_bullets"
            ),
        )
        warnings.append(_FALLBACK_WARNING)
        warnings.append(_FALLBACK_PROVENANCE)
    elapsed_seconds = runtime.clock() - runtime.started_at
    record_metrics(
        {
            "provider_calls": runtime.provider_call_count,
            "provider_elapsed_ms": round(runtime.provider_elapsed_seconds * 1000, 2),
            "provider_call_latencies_ms": runtime.provider_call_latencies_ms,
            "provider_call_kinds": runtime.provider_call_kinds,
            "provider_timeout_count": len(runtime.provider_timeout_kinds),
            "provider_timeout_kinds": runtime.provider_timeout_kinds,
            "total_elapsed_ms": round(elapsed_seconds * 1000, 2),
            "deadline_seconds": runtime.limits.total_timeout_seconds,
            "core_timeout_seconds": runtime.limits.core_timeout_seconds,
            "chunk_timeout_seconds": runtime.limits.chunk_timeout_seconds,
            "repair_timeout_seconds": runtime.limits.repair_timeout_seconds,
            "deadline_exceeded": elapsed_seconds >= runtime.limits.total_timeout_seconds
            or diagnostics.get("provider_deadline", 0) > 0,
            "call_cap": runtime.limits.max_provider_calls,
            "cache_hits": localization.cache_hits,
            "localization_targets": localization.target_count,
            "localization_unique_targets": localization.unique_target_count,
            "localization_primary_chunks": (
                (localization.unique_target_count + localization_chunk_size - 1)
                // localization_chunk_size
            ),
            "localization_repair_calls": localization.repair_calls,
            "localization_unresolved": localization.unresolved_count,
        }
    )
    if diagnostics:
        _LOGGER.info(
            "cv_generation_diagnostics request_id=%s trace_id=%s provider_calls=%s "
            "provider_elapsed_ms=%.2f total_elapsed_ms=%.2f codes=%s",
            request.identity.request_id,
            request.identity.trace_id,
            runtime.provider_call_count,
            runtime.provider_elapsed_seconds * 1000,
            elapsed_seconds * 1000,
            ",".join(f"{code}:{count}" for code, count in sorted(diagnostics.items())),
        )
        warnings.extend(
            f"cv_generation.diagnostic={code}:count={count}"
            for code, count in sorted(diagnostics.items())
        )
    if localization.failure_details:
        omission_prefix = "cv_generation.localization_omission="
        current = omission_prefix
        for detail in localization.failure_details:
            candidate = detail if current == omission_prefix else f"; {detail}"
            if len(current) + len(candidate) > 480:
                warnings.append(current)
                current = omission_prefix + detail
            else:
                current += candidate
        if current != omission_prefix:
            warnings.append(current)
    application_position = _localized_field(request, localized_fields, "headline", 0, "headline")
    if application_role:
        application_position = application_heading
        candidate_text = " ".join(
            [
                *request.candidate.skills,
                *(entry.description or "" for entry in request.candidate.experience),
                *(entry.description or "" for entry in request.candidate.projects),
                *(
                    technology
                    for entry in request.candidate.projects
                    for technology in entry.technologies
                ),
            ]
        )
        supported_skills = [
            skill
            for skill in dict.fromkeys(
                _target_skill_literal(value)
                for value in [*request.job.required_skills, *request.job.preferred_skills]
            )
            if _stable_source_text(skill)
            and re.search(_target_skill_pattern(skill), candidate_text, re.IGNORECASE)
        ]
        gaps = [
            skill
            for skill in request.job.required_skills
            if not re.search(_target_skill_pattern(skill), candidate_text, re.IGNORECASE)
        ]
        if gaps:
            warnings.append("cv_generation.target_skill_gaps=" + ", ".join(gaps)[:440])
        if request.locale.casefold().startswith("vi"):
            objective_value = f"Ứng tuyển vị trí {application_role}."
            if supported_skills:
                objective_value += (
                    f" Mong muốn vận dụng kinh nghiệm với {', '.join(supported_skills[:4])} "
                    "để đóng góp trong vai trò này."
                )
        else:
            has_grounded_objective = bool(objective_value)
            if objective_value:
                # Keep the candidate's grounded ambition rather than always
                # replacing it with a generated keyword list.
                objective_value = f"Applying for the {application_role} role. " + objective_value
            else:
                objective_value = f"Applying for the {application_role} role."
            if not has_grounded_objective and supported_skills:
                objective_value += f" Bringing a background in {', '.join(supported_skills[:4])}."
    omitted_skill_members = sum(
        _skill_member_display(request, source) is None
        for source in request.candidate.skills
        if _skill_member_is_relevant(request, source)
    )
    if omitted_skill_members:
        warnings.insert(
            0,
            "cv_generation.diagnostic=skill_member_locale_omission:count="
            + str(omitted_skill_members),
        )
    priority_prefixes = (
        "cv_generation.localization_omission=",
        "cv_generation.diagnostic=skill_member_locale_omission:",
        "cv_generation.provenance=",
        "cv_generation.localization=",
    )
    # Only locally produced markers are eligible for priority. Preserve stable
    # ordering and useful provider notes within the existing response limit.
    prioritized = sorted(warnings, key=lambda value: not value.startswith(priority_prefixes))
    unique_warnings = list(dict.fromkeys([*prioritized, *provider_warnings]))[:20]
    draft = CvDraft(
        request_id=request.identity.request_id,
        trace_id=request.identity.trace_id,
        operation_attempt_id=request.identity.operation_attempt_id,
        candidate_id=request.candidate.candidate_id,
        target_job_id=request.job.job_id,
        template_type=request.template_type,
        full_name=request.candidate.full_name,
        title=(
            f"Hồ sơ - {request.candidate.full_name}"
            if request.locale.casefold().startswith("vi")
            else f"CV - {request.candidate.full_name}"
        ),
        position=application_position,
        email=request.candidate.email,
        phone=request.candidate.phone,
        link=request.candidate.link,
        address=request.candidate.address,
        career_objective=objective_value,
        education=localized_education,
        projects=draft_projects,
        work_experience=draft_experience,
        skills=_group_skills(request),
        activities=_localized_text_list(
            request, localized_fields, "activities", request.candidate.activities
        ),
        certificates=_localized_text_list(
            request, localized_fields, "certificates", request.candidate.certificates
        ),
        awards=_localized_text_list(request, localized_fields, "awards", request.candidate.awards),
        warnings=unique_warnings,
        source_version=request.source_version,
        content_version=request.content_version,
    )
    if review_metadata is not None:
        review_metadata.update(
            _review_metadata_for_draft(
                request,
                draft,
                core,
                localization,
                application_role=application_role,
                fallback_bullets_by_experience=fallback_bullets_by_experience,
                fallback_bullets_by_project=fallback_bullets_by_project,
                localized_bullets_by_experience=localized_bullets_by_experience,
                localized_bullets_by_project=localized_bullets_by_project,
                objective_omitted=objective_omitted,
                remaining_experience=remaining_experience,
                remaining_projects=remaining_projects,
            )
        )
    return draft
