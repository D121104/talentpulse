from __future__ import annotations

import re
import unicodedata

from talentpulse_ai.modules.cv_generator.grounding import (
    _RESPONSIBILITY_ACTION_RE as _RESPONSIBILITY_ACTION_RE,
)
from talentpulse_ai.modules.cv_generator.grounding import (
    _canonical_named_entities,
    _contains_named_entity,
    _protected_anchors,
)
from talentpulse_ai.modules.cv_generator.grounding import (
    _entry_has_evidence as _entry_has_evidence,
)
from talentpulse_ai.modules.cv_generator.grounding import (
    _grounding_rejection_reason as _grounding_rejection_reason,
)
from talentpulse_ai.modules.cv_generator.grounding import (
    _is_generic_bullet as _is_generic_bullet,
)
from talentpulse_ai.modules.cv_generator.grounding import (
    _is_grounded as _is_grounded,
)
from talentpulse_ai.modules.cv_generator.grounding import (
    _locale_literals as _locale_literals,
)
from talentpulse_ai.modules.cv_generator.grounding import (
    _project_narrative_rejection as _project_narrative_rejection,
)
from talentpulse_ai.modules.cv_generator.grounding import (
    _proper_nouns as _proper_nouns,
)
from talentpulse_ai.modules.cv_generator.grounding import (
    _salient_anchors as _salient_anchors,
)
from talentpulse_ai.modules.cv_generator.lexical_rules import (
    _TECHNOLOGY_TERMS as _TECHNOLOGY_TERMS,
)
from talentpulse_ai.modules.cv_generator.lexical_rules import (
    _content_key,
)
from talentpulse_ai.modules.cv_generator.lexical_rules import (
    _dedupe_texts as _dedupe_texts,
)
from talentpulse_ai.modules.cv_generator.lexical_rules import (
    _target_skill_literal as _target_skill_literal,
)
from talentpulse_ai.modules.cv_generator.lexical_rules import (
    _target_skill_pattern as _target_skill_pattern,
)
from talentpulse_ai.modules.cv_generator.locale_validation import (
    _SHORT_SCALAR_FIELDS as _SHORT_SCALAR_FIELDS,
)
from talentpulse_ai.modules.cv_generator.locale_validation import (
    _locale_matches as _locale_matches,
)
from talentpulse_ai.modules.cv_generator.locale_validation import (
    _short_scalar_locale_matches as _short_scalar_locale_matches,
)
from talentpulse_ai.modules.cv_generator.locale_validation import (
    _source_locale_matches as _source_locale_matches,
)
from talentpulse_ai.modules.cv_generator.locale_validation import (
    _stable_source_text as _stable_source_text,
)
from talentpulse_ai.modules.cv_generator.schemas import (
    CandidateEducation,
    CandidateExperience,
    CandidateProject,
    CvDraftRequest,
    ProviderLocalizedItems,
    ProviderTextValue,
)
from talentpulse_ai.modules.cv_generator.skill_rules import (
    _ORDINARY_SKILL_LABELS as _ORDINARY_SKILL_LABELS,
)
from talentpulse_ai.modules.cv_generator.skill_rules import (
    _SKILL_GROUPS as _SKILL_GROUPS,
)
from talentpulse_ai.modules.cv_generator.skill_rules import (
    _application_role as _application_role,
)
from talentpulse_ai.modules.cv_generator.skill_rules import (
    _canonical_skill_member as _canonical_skill_member,
)
from talentpulse_ai.modules.cv_generator.skill_rules import (
    _has_application_target as _has_application_target,
)
from talentpulse_ai.modules.cv_generator.skill_rules import (
    _skill_member_display as _skill_member_display,
)
from talentpulse_ai.modules.cv_generator.skill_rules import (
    _skill_member_is_relevant as _skill_member_is_relevant,
)

_GENERIC_LOCALIZATION_VALUES = {
    "chỉ định chính xác",
    "this is a placeholder for the career objective field",
    "n/a",
    "unknown",
    "mục tiêu nghề nghiệp",
    "tham gia các hoạt động nhóm",
    "giải thưởng xuất sắc",
}
_GENERIC_SECTION_VALUES: dict[str, set[str]] = {
    "activities": {
        "activity",
        "activities",
        "volunteer activity",
        "hoạt động",
        "các hoạt động",
    },
    "awards": {"award", "awards", "achievement", "giải thưởng"},
}


def _validate_scalar_payload(raw: object) -> ProviderTextValue:
    # Retain the legacy validator for callers that still import the old contract.
    return ProviderTextValue.model_validate(raw)


def _validate_localized_payload(
    raw: object, requested_keys: set[str]
) -> tuple[dict[str, str], int, int]:
    """Validate a flat batch and discard unknown or repeated provider keys."""
    payload = ProviderLocalizedItems.model_validate(raw)
    values: dict[str, str] = {}
    unknown_count = 0
    duplicate_count = 0
    for item in payload.items:
        if item.key not in requested_keys:
            unknown_count += 1
            continue
        if item.key in values:
            duplicate_count += 1
            continue
        values[item.key] = item.text
    return values, unknown_count, duplicate_count


def _normalize_localization_text(value: str) -> str:
    return " ".join(value.casefold().strip().rstrip(".!?").split())


def _translation_cache_key(source: str, locale: str) -> tuple[str, str]:
    normalized_source = unicodedata.normalize("NFKC", " ".join(source.split()))
    return normalized_source.casefold(), locale.casefold()


def _source_localization_value(
    request: CvDraftRequest, section: str, source_index: int, field: str
) -> str | None:
    if section == "objective":
        return request.candidate.career_objective if field == "career_objective" else None
    if section == "headline":
        return request.candidate.headline if field == "headline" else None
    if section == "application":
        return request.job.title if field == "title" and _has_application_target(request) else None
    if section == "education" and source_index < len(request.candidate.education):
        value = getattr(request.candidate.education[source_index], field, None)
        return value if isinstance(value, str) else None
    if section == "experience" and source_index < len(request.candidate.experience):
        value = getattr(request.candidate.experience[source_index], field, None)
        return value if isinstance(value, str) else None
    if section == "projects" and source_index < len(request.candidate.projects):
        value = getattr(request.candidate.projects[source_index], field, None)
        return value if isinstance(value, str) else None
    if section == "skills" and source_index < len(request.candidate.skills):
        return request.candidate.skills[source_index] if field == "name" else None
    source_values: dict[str, list[str]] = {
        "certificates": request.candidate.certificates,
        "activities": request.candidate.activities,
        "awards": request.candidate.awards,
    }
    values = source_values.get(section)
    if values is not None and source_index < len(values) and field == "text":
        return values[source_index]
    return None


def _source_localization_evidence(
    request: CvDraftRequest, section: str, source_index: int
) -> list[str]:
    source: CandidateEducation | CandidateExperience | CandidateProject | str | None = None
    if section == "education" and source_index < len(request.candidate.education):
        source = request.candidate.education[source_index]
    elif section == "experience" and source_index < len(request.candidate.experience):
        source = request.candidate.experience[source_index]
    elif section == "projects" and source_index < len(request.candidate.projects):
        source = request.candidate.projects[source_index]
    elif section == "skills" and source_index < len(request.candidate.skills):
        source = request.candidate.skills[source_index]
    elif section in {"certificates", "activities", "awards"}:
        value = _source_localization_value(request, section, source_index, "text")
        return [value] if value else []
    elif section == "objective":
        return [request.candidate.career_objective] if request.candidate.career_objective else []
    elif section == "headline":
        return [request.candidate.headline] if request.candidate.headline else []
    elif section == "application":
        return [request.job.title]
    if isinstance(source, str):
        return [source]
    if source is None:
        return []
    values: list[str] = []
    for value in source.model_dump().values():
        if isinstance(value, str) and value.strip():
            values.append(value)
        elif isinstance(value, list):
            values.extend(item for item in value if isinstance(item, str) and item.strip())
    return values


def _is_intentionally_preserved(
    request: CvDraftRequest, section: str, source_index: int, field: str, source: str
) -> bool:
    """Return whether a scalar is a canonical literal rather than translatable prose."""
    del field
    if _stable_source_text(source):
        return True
    canonical_entities = _canonical_named_entities(request.candidate)
    normalized_source = _content_key(source)
    return any(normalized_source == _content_key(entity) for entity in canonical_entities)


def _localized_value_is_grounded(
    request: CvDraftRequest,
    value: str | None,
    *,
    section: str,
    source_index: int,
    field: str,
) -> tuple[str | None, str | None]:
    if value is None or not value.strip():
        return None, "localization_missing"
    source = _source_localization_value(request, section, source_index, field)
    if section == "application":
        role = _application_role(request)
        if role is not None and value.strip() in {role, request.job.title}:
            return value.strip(), None
        return None, "grounding_anchor_rejection"
    normalized_value = _normalize_localization_text(value)
    if (
        not request.locale.casefold().startswith("vi")
        and section == "projects"
        and field == "description"
        and 0 <= source_index < len(request.candidate.projects)
    ):
        project_rejection = _project_narrative_rejection(
            value, request.candidate.projects[source_index], require_coverage=True
        )
        if project_rejection is not None:
            return None, project_rejection
    if (
        not request.locale.casefold().startswith("vi")
        and section in {"experience", "projects"}
        and field == "description"
        and (
            _is_generic_bullet(value)
            or (
                section == "experience"
                and re.match(
                    r"^(?:skills?|technologies|tools|tech stack)\s*:", value, re.IGNORECASE
                )
            )
        )
    ):
        return None, "localization_generic_rejection"
    if (
        normalized_value in _GENERIC_LOCALIZATION_VALUES
        or normalized_value in _GENERIC_SECTION_VALUES.get(section, set())
    ):
        return None, "localization_generic_rejection"
    evidence = _source_localization_evidence(request, section, source_index)
    grounding_value = value
    if (
        source is not None
        and section == "projects"
        and field == "description"
        and not request.locale.casefold().startswith("vi")
    ):
        # Translated headings and line-initial actions are not invented named entities.
        # Admit only ordinary English equivalents backed by this project's own source.
        source_text = source.casefold()
        # Only a source-owned CV licenses its recruitment-document equivalents.
        # Do not interpret the ordinary verb "resume" as an acronym globally.
        if re.search(r"\bCVs?\b", source):
            grounding_value = re.sub(
                r"\b(?:résumés?|resumes?|curriculum\s+vitae)\b",
                "CV",
                value,
                flags=re.IGNORECASE,
            )
        for source_phrase, (stem, forms) in {
            "phát triển": ("develop", ("", "s", "ed", "ing")),
            "thiết kế": ("design", ("", "s", "ed", "ing")),
            "theo dõi": ("track", ("", "s", "ed", "ing")),
            "quản lý": ("manag", ("e", "es", "ed", "ing")),
            "chức năng": ("feature", ("", "s")),
            "tính năng": ("feature", ("", "s")),
            "công việc": ("job", ("", "s")),
            "người dùng": ("user", ("", "s")),
            "đăng nhập": ("user", ("", "s")),
        }.items():
            if source_phrase in source_text:
                evidence.extend((stem + suffix).capitalize() for suffix in forms)
        if "đăng nhập" in source_text:
            evidence.extend(("Login", "Logins"))
    rejection = _grounding_rejection_reason(
        grounding_value,
        evidence,
        locale=request.locale,
        preserved_literals=_locale_literals(request.candidate),
    )
    if (section, field) in _SHORT_SCALAR_FIELDS and (
        rejection is None or rejection == "locale_rejection"
    ):
        if not _short_scalar_locale_matches(value, request.locale):
            return None, "locale_rejection"
        rejection = None
    if rejection is not None:
        return None, rejection
    if source is not None:
        source_anchors = _protected_anchors([source])
        if not source_anchors.issubset(_protected_anchors([grounding_value])):
            return None, "localization_anchor_rejection"
        for entity in _canonical_named_entities(request.candidate):
            if entity.casefold() == source.casefold():
                continue
            if _contains_named_entity(source, entity) and not _contains_named_entity(value, entity):
                return None, "localization_named_entity_rejection"
    return " ".join(value.split()).strip(), None
