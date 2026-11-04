from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

from talentpulse_ai.modules.cv_generator.bullet_shaping import (
    _deterministic_rewrite as _deterministic_rewrite,
)
from talentpulse_ai.modules.cv_generator.bullet_shaping import (
    _fallback_bullets as _fallback_bullets,
)
from talentpulse_ai.modules.cv_generator.bullet_shaping import (
    _fallback_objective as _fallback_objective,
)
from talentpulse_ai.modules.cv_generator.bullet_shaping import (
    _shape_bullet as _shape_bullet,
)
from talentpulse_ai.modules.cv_generator.bullet_shaping import (
    _source_technologies as _source_technologies,
)
from talentpulse_ai.modules.cv_generator.bullet_shaping import (
    _split_clauses as _split_clauses,
)
from talentpulse_ai.modules.cv_generator.schemas import (
    CandidateEducation,
    CandidateExperience,
    CandidateProfile,
    CandidateProject,
    CvDraftRequest,
    DraftSkill,
    _model_key,
)
from talentpulse_ai.modules.cv_generator.validators import (
    _ORDINARY_SKILL_LABELS,
    _SKILL_GROUPS,
    _TECHNOLOGY_TERMS,
    _entry_has_evidence,
    _has_application_target,
    _is_intentionally_preserved,
    _locale_literals,
    _skill_member_display,
    _skill_member_is_relevant,
    _source_locale_matches,
    _source_localization_value,
    _target_skill_literal,
    _target_skill_pattern,
)


def _candidate_facts(candidate: CandidateProfile) -> list[str]:
    facts: list[str] = [candidate.full_name]
    facts.extend(value for value in (candidate.headline, candidate.career_objective) if value)
    facts.extend(candidate.skills)
    facts.extend(candidate.certificates)
    facts.extend(candidate.activities)
    facts.extend(candidate.awards)
    for item in [*candidate.experience, *candidate.education, *candidate.projects]:
        for value in item.model_dump().values():
            if isinstance(value, str):
                facts.append(value)
            elif isinstance(value, list):
                facts.extend(entry for entry in value if isinstance(entry, str))
    return facts


def _entry_target_terms(
    request: CvDraftRequest, entry: CandidateExperience | CandidateProject
) -> list[str]:
    text = " ".join(
        [
            entry.description or "",
            *(entry.technologies if isinstance(entry, CandidateProject) else ()),
        ]
    )
    return list(
        dict.fromkeys(
            _target_skill_literal(skill)
            for skill in [*request.job.required_skills, *request.job.preferred_skills]
            if re.search(_target_skill_pattern(skill), text, re.IGNORECASE)
        )
    )


def _select_entry_indices(
    rows: Sequence[CandidateExperience | CandidateProject],
    projects: bool,
    required: Sequence[str],
    preferred: Sequence[str],
    context: Sequence[str],
    targeted: bool,
) -> list[int]:
    ranked = []
    seen: set[str] = set()
    for index, entry in enumerate(rows):
        if not _entry_has_evidence(entry):
            continue
        identity = _model_key(entry)
        if identity in seen:
            continue
        seen.add(identity)
        title = entry.project_name if isinstance(entry, CandidateProject) else entry.position
        text = " ".join(
            [
                title or "",
                entry.description or "",
                *(entry.technologies if isinstance(entry, CandidateProject) else ()),
            ]
        )
        counts = (
            tuple(
                sum(
                    bool(re.search(_target_skill_pattern(term), text, re.IGNORECASE))
                    for term in dict.fromkeys(terms)
                )
                for terms in (required, preferred, context)
            )
            if targeted
            else (0, 0, 0)
        )
        if projects and targeted and not any(counts):
            continue
        ranked.append((tuple(-count for count in counts), index))
    return [index for _, index in sorted(ranked)[:3]]


def _selected_entry_indices(request: CvDraftRequest) -> tuple[list[int], list[int]]:
    generic = {"data", "software", "engineering", "communication", "teamwork", "english"}
    required = [
        _target_skill_literal(value)
        for value in request.job.required_skills
        if value.casefold() not in generic
    ]
    preferred = [
        _target_skill_literal(value)
        for value in request.job.preferred_skills
        if value.casefold() not in generic
    ]
    context = [
        term
        for term in [
            *_TECHNOLOGY_TERMS,
            "ETL",
            "ELT",
            "data pipeline",
            "data warehouse",
            "streaming",
            "medallion architecture",
        ]
        if re.search(_target_skill_pattern(term), request.job.description or "", re.IGNORECASE)
    ]
    if any(
        value.casefold() in {"fastapi", "restapi", "rest api", "restful api"}
        for value in [*required, *preferred]
    ):
        context.append("API")  # Transferable API work is not a claim of framework proficiency.
    targeted = _has_application_target(request)

    return (
        _select_entry_indices(
            request.candidate.experience, False, required, preferred, context, targeted
        ),
        _select_entry_indices(
            request.candidate.projects, True, required, preferred, context, targeted
        ),
    )


_LOCALIZATION_FIELDS: dict[str, tuple[str, ...]] = {
    "education": ("degree", "major", "description"),
    "experience": ("position", "description"),
    "projects": ("project_name", "role", "description"),
    "skills": ("name", "description"),
    "certificates": ("text",),
    "activities": ("text",),
    "awards": ("text",),
}


def _group_skills(request: CvDraftRequest) -> list[DraftSkill]:
    members: dict[str, list[str]] = {name: [] for name, _, _ in _SKILL_GROUPS}
    seen: set[str] = set()
    for source in request.candidate.skills:
        if not _skill_member_is_relevant(request, source):
            continue
        literal = _skill_member_display(request, source)
        if literal is None:
            continue
        base = re.sub(r"\s*\([^()]*\)\s*$", "", source).strip()
        canonical = _target_skill_literal(" ".join(base.split())).casefold()
        if canonical == "springboot":
            canonical = "spring boot"
        identity_label = next(
            (
                english.casefold()
                for english, vietnamese in _ORDINARY_SKILL_LABELS
                if canonical in {english.casefold(), vietnamese.casefold()}
            ),
            canonical,
        )
        qualification = re.search(r"\([^()]*\)\s*$", source)
        identity = identity_label + (
            " ".join(qualification.group().casefold().split()) if qualification else ""
        )
        if identity in seen:
            continue
        seen.add(identity)
        category = next((name for name, _, names in _SKILL_GROUPS if canonical in names), "Other")
        if re.search(r"\b(?:english|tiếng anh|toeic|ielts|toefl)\b", source, re.IGNORECASE):
            category = "Languages"
        members[category].append(literal)
    for source in request.candidate.certificates:
        if _skill_member_is_relevant(request, source) and re.search(
            r"\b(?:toeic|ielts|toefl)\b", source, re.IGNORECASE
        ):
            literal = source
            if literal and literal not in members["Languages"]:
                members["Languages"].append(literal)
    groups = []
    for english, vietnamese, _ in _SKILL_GROUPS:
        label = vietnamese if request.locale.casefold().startswith("vi") else english
        chunk: list[str] = []
        for literal in members[english]:
            if chunk and len("; ".join([*chunk, literal])) > 2000:
                groups.append(DraftSkill(name=label, description="; ".join(chunk)))
                chunk = []
            chunk.append(literal)
        if chunk:
            groups.append(DraftSkill(name=label, description="; ".join(chunk)))
    return groups


def _add_localization_target(
    request: CvDraftRequest,
    localized: Mapping[tuple[str, int, str], str],
    targets: list[dict[str, object]],
    section: str,
    source_index: int,
    field: str,
    source: object,
) -> None:
    if not isinstance(source, str) or not source.strip():
        return
    key = (section, source_index, field)
    if (
        key in localized
        or _source_locale_matches(
            source,
            request.locale,
            section,
            field,
            preserved_literals=_locale_literals(request.candidate),
        )
        or _is_intentionally_preserved(request, section, source_index, field, source)
    ):
        return
    targets.append({"section": section, "source_index": source_index, "field": field})


def _localization_targets(
    request: CvDraftRequest, localized: dict[tuple[str, int, str], str]
) -> list[dict[str, object]]:
    """Enumerate unresolved source scalars; mapping never comes from the provider."""
    targets: list[dict[str, object]] = []
    selected_experience, selected_projects = _selected_entry_indices(request)
    _add_localization_target(
        request,
        localized,
        targets,
        "objective",
        0,
        "career_objective",
        request.candidate.career_objective,
    )
    _add_localization_target(
        request, localized, targets, "headline", 0, "headline", request.candidate.headline
    )

    structured_sources: list[
        tuple[str, Sequence[CandidateEducation | CandidateExperience | CandidateProject]]
    ] = [
        ("education", request.candidate.education),
        ("experience", request.candidate.experience),
        ("projects", request.candidate.projects),
    ]
    for section, entries in structured_sources:
        for source_index, entry in enumerate(entries):
            if section == "experience" and source_index not in selected_experience:
                continue
            if section == "projects" and source_index not in selected_projects:
                continue
            for field in _LOCALIZATION_FIELDS[section]:
                _add_localization_target(
                    request,
                    localized,
                    targets,
                    section,
                    source_index,
                    field,
                    getattr(entry, field, None),
                )

    # Group members are exact owned literals, not model-generated qualification translations.

    text_sources: list[tuple[str, Sequence[str]]] = [
        ("certificates", request.candidate.certificates),
        ("activities", request.candidate.activities),
        ("awards", request.candidate.awards),
    ]
    for section, text_values in text_sources:
        for source_index, source in enumerate(text_values):
            _add_localization_target(
                request, localized, targets, section, source_index, "text", source
            )
    return targets


def _fallback_localized_value(
    request: CvDraftRequest, section: str, source_index: int, field: str
) -> str | None:
    source = _source_localization_value(request, section, source_index, field)
    if not source or not source.strip():
        return None
    if _source_locale_matches(
        source,
        request.locale,
        section,
        field,
        preserved_literals=_locale_literals(request.candidate),
    ) or _is_intentionally_preserved(request, section, source_index, field, source):
        return source.strip()
    # Required names retain a structural label because the response contract requires them;
    # rich translated content is omitted rather than copied from the wrong locale.
    if section == "projects" and field == "project_name":
        return (
            f"Project {source_index + 1}"
            if not request.locale.casefold().startswith("vi")
            else f"Dự án {source_index + 1}"
        )
    if section == "skills" and field == "name":
        return "Skill" if not request.locale.casefold().startswith("vi") else "Kỹ năng"
    return None


def _localized_field(
    request: CvDraftRequest,
    localized: dict[tuple[str, int, str], str],
    section: str,
    source_index: int,
    field: str,
) -> str | None:
    return localized.get((section, source_index, field)) or _fallback_localized_value(
        request, section, source_index, field
    )


def _localized_text_list(
    request: CvDraftRequest,
    localized: dict[tuple[str, int, str], str],
    section: str,
    values: Sequence[str],
) -> list[str]:
    result: list[str] = []
    for index in range(len(values)):
        value = _localized_field(request, localized, section, index, "text")
        if value is not None:
            result.append(value)
    return result


def _localization_target_key(section: str, source_index: int, field: str) -> str:
    """Build a stable opaque key that keeps provider mapping in application code."""
    return f"{section}:{source_index}:{field}"


def _scalar_target_plan(
    request: CvDraftRequest, localized: Mapping[tuple[str, int, str], str]
) -> list[dict[str, object]]:
    plans: list[dict[str, object]] = []
    for target in _localization_targets(request, dict(localized)):
        section = target.get("section")
        source_index = target.get("source_index")
        field = target.get("field")
        if (
            not isinstance(section, str)
            or not isinstance(source_index, int)
            or not isinstance(field, str)
        ):
            continue
        source = _source_localization_value(request, section, source_index, field)
        if isinstance(source, str) and source.strip():
            plans.append(
                {
                    "key": _localization_target_key(section, source_index, field),
                    "section": section,
                    "source_index": source_index,
                    "field": field,
                    "source": source,
                }
            )
    return plans
