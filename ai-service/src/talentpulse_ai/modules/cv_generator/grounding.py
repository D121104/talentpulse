from __future__ import annotations

import re
from collections.abc import Iterable
from decimal import Decimal

from talentpulse_ai.modules.cv_generator.lexical_rules import (
    _TECHNOLOGY_TERMS,
    _TOKEN_RE,
    _target_skill_literal,
)
from talentpulse_ai.modules.cv_generator.locale_validation import (
    _locale_matches,
    _ordinary_title_case_scalar,
    _stable_source_text,
)
from talentpulse_ai.modules.cv_generator.schemas import (
    CandidateExperience,
    CandidateProfile,
    CandidateProject,
)

_LOCALIZATION_COMMON_WORDS = frozenset(
    {
        "bachelor",
        "master",
        "degree",
        "computer",
        "science",
        "engineering",
        "engineer",
        "developer",
        "analyst",
        "manager",
        "backend",
        "data",
        "university",
        "college",
        "major",
        "description",
        "graduated",
        "honors",
        "volunteer",
        "technology",
        "community",
        "award",
        "certificate",
        "certified",
        "outstanding",
        "employee",
        "recruitment",
        "platform",
        "hiring",
        "organization",
        "member",
        "professional",
        "technical",
        "english",
        "tiếng",
        "cử",
        "nhân",
        "khoa",
        "học",
        "máy",
        "tính",
        "tốt",
        "giỏi",
        "phát",
        "triển",
        "xây",
        "dựng",
        "tình",
        "nguyện",
        "giải",
        "thưởng",
        "xuất",
        "sắc",
    }
)
_GENERIC_BULLET_RE = re.compile(
    r"^(?:áp dụng|đảm nhiệm các nội dung chính|thực hiện các nội dung chính|"
    r"applied|delivered the documented responsibilities)\b",
    re.IGNORECASE,
)
_VERB_REWRITES = {
    "built": "Phát triển",
    "developed": "Phát triển",
    "designed": "Thiết kế",
    "implemented": "Triển khai",
    "managed": "Quản lý",
    "created": "Xây dựng",
    "maintained": "Vận hành",
    "led": "Điều phối",
}
_RESPONSIBILITY_ACTION_RE = re.compile(
    r"\b(?:"
    + "|".join(
        re.escape(action)
        for action in dict.fromkeys(
            [
                *_VERB_REWRITES,
                *_VERB_REWRITES.values(),
                "develop",
                "deploy",
                "deployed",
                "tested",
                "processed",
                "coordinated",
                "orchestrated",
                "kiểm thử",
                "xử lý",
                "bảo trì",
            ]
        )
    )
    + r")\b",
    re.IGNORECASE,
)


def _salient_anchors(text: str) -> set[str]:
    return {
        f"{Decimal(number.replace(',', '.')).normalize()}%"
        for number in re.findall(r"\b(\d+(?:[.,]\d+)?)\s*%", text)
    } | set(re.findall(r"(?<!\w)[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?!\w)", text))


def _protected_anchors(values: Iterable[str]) -> set[str]:
    """Return numbers, URLs, acronyms and known technologies that must survive translation."""
    anchors: set[str] = set()
    for value in values:
        anchors.update(
            str(Decimal(number.replace(",", ".")).normalize())
            for number in re.findall(r"\b\d+(?:[.,]\d+)?\b", value)
        )
        anchors.update(_salient_anchors(value))
        anchors.update(re.findall(r"\b(?:19|20)\d{2}(?:[-/]\d{1,2})?\b", value))
        anchors.update(
            url.casefold().rstrip(".,;:)")
            for url in re.findall(r"(?:https?://|www\.)[^\s<>\"]+", value, re.IGNORECASE)
        )
        for token in _TOKEN_RE.findall(value):
            folded = token.casefold()
            # English plural suffixes do not change the underlying acronym (KPI/KPIs).
            if token.endswith("s") and len(token) > 2 and token[:-1].isupper():
                folded = token[:-1].casefold()
                anchors.add(folded)
                continue
            if folded in {"api", "apis", "restapi", "pgsql", "postgres", "postgresql"}:
                anchors.add(_target_skill_literal(token).casefold())
                continue
            if (
                (token.isupper() and len(token) >= 2)
                or any(ch in token for ch in "+#/")
                or folded in _TECHNOLOGY_TERMS
            ):
                anchors.add("api" if folded == "apis" else folded)
                if folded == "fastapi":
                    anchors.add("api")
            elif folded == "apis":
                anchors.add("api")
    return {anchor.casefold() for anchor in anchors}


def _proper_nouns(value: str) -> set[str]:
    # Normalize ordinary phrases only; their standalone words can still be names.
    for phrase in ("tiếng anh", "phân tích", "phần mềm"):
        value = re.sub(rf"\b{phrase.replace(' ', r'\s+')}\b", phrase, value, flags=re.IGNORECASE)
    nouns: set[str] = set()
    for sentence in re.split(r"[.!?]+\s*", value):
        words = _TOKEN_RE.findall(sentence)
        for token in words[1:]:
            if (
                token.casefold() not in _LOCALIZATION_COMMON_WORDS
                and token.casefold() not in _TECHNOLOGY_TERMS
                and token[:1].isupper()
                and token[1:].islower()
                and len(token) > 2
            ):
                nouns.add(token.casefold())
    return nouns


def _grounding_rejection_reason(
    text: str,
    evidence: Iterable[str],
    *,
    locale: str | None = None,
    preserved_literals: Iterable[str] = (),
) -> str | None:
    generated = text.strip()
    if not generated:
        return "grounding_anchor_rejection"
    evidence_values = list(evidence)
    if not _protected_anchors([generated]).issubset(_protected_anchors(evidence_values)):
        return "grounding_anchor_rejection"
    generated_nouns = _proper_nouns(generated)
    if generated_nouns and not _ordinary_title_case_scalar(generated):
        # Metadata names can become sentence-internal names in generated prose.
        evidence_nouns = set().union(*(_proper_nouns("at " + value) for value in evidence_values))
        if not generated_nouns.issubset(evidence_nouns):
            return "grounding_anchor_rejection"
    if locale is not None and not _locale_matches(
        generated, locale, preserved_literals=preserved_literals
    ):
        return "locale_rejection"
    return None


def _is_grounded(
    text: str,
    evidence: Iterable[str],
    *,
    locale: str | None = None,
    preserved_literals: Iterable[str] = (),
) -> bool:
    return (
        _grounding_rejection_reason(
            text, evidence, locale=locale, preserved_literals=preserved_literals
        )
        is None
    )


def _entry_has_evidence(entry: CandidateExperience | CandidateProject) -> bool:
    """Only send entries with source evidence to a provider."""
    values = entry.model_dump().values()
    return any(
        (isinstance(value, str) and value.strip())
        or (
            isinstance(value, list)
            and any(isinstance(item, str) and item.strip() for item in value)
        )
        for value in values
    )


def _canonical_named_entities(candidate: CandidateProfile) -> list[str]:
    """Return source-owned names that may appear inside translatable prose."""
    values: list[str] = [candidate.full_name]
    if candidate.link:
        values.append(candidate.link)
    values.extend(
        value for entry in candidate.experience for value in (entry.company_name,) if value
    )
    values.extend(value for entry in candidate.education for value in (entry.school_name,) if value)
    for project in candidate.projects:
        words = _TOKEN_RE.findall(project.project_name)
        if words and words[0].casefold() not in _LOCALIZATION_COMMON_WORDS:
            if any(
                entry.company_name
                and re.match(rf"{re.escape(words[0])}(?!\w)", entry.company_name, re.IGNORECASE)
                for entry in candidate.experience
            ):
                values.append(project.project_name)
    values.extend(
        technology
        for entry in candidate.projects
        for technology in entry.technologies
        if technology
    )
    values.extend(
        certificate for certificate in candidate.certificates if _stable_source_text(certificate)
    )
    return list(dict.fromkeys(" ".join(value.split()) for value in values if value.strip()))


def _contains_named_entity(text: str, entity: str) -> bool:
    return entity.casefold() in text.casefold()


def _locale_literals(candidate: CandidateProfile) -> list[str]:
    # Even translatable project titles may occur as exact owned names inside prose.
    technical_phrases = [
        phrase
        for phrase in ("data warehouse", "data quality")
        if any(
            re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", description or "", re.IGNORECASE)
            for description in [
                *(entry.description for entry in candidate.experience),
                *(entry.description for entry in candidate.projects),
            ]
        )
    ]
    return [
        *_canonical_named_entities(candidate),
        *(p.project_name for p in candidate.projects),
        *technical_phrases,
    ]


def _is_generic_bullet(text: str) -> bool:
    normalized = " ".join(text.split()).strip(" .")
    tokens = _TOKEN_RE.findall(normalized)
    keyword_only = bool(tokens) and all(
        token.casefold() in _TECHNOLOGY_TERMS
        or token.casefold() in {"apis", "api", "backend", "frontend"}
        for token in tokens
    )
    return bool(
        keyword_only
        or _GENERIC_BULLET_RE.search(normalized)
        or re.fullmatch(
            r"(?:(?:senior|junior|full[ -]?stack|backend|frontend|technical)\s+)*"
            r"(?:developer|engineer|lead)(?:\s*/\s*(?:technical\s+)?lead)?",
            normalized,
            re.IGNORECASE,
        )
    )


def _project_narrative_rejection(
    text: str, source: CandidateProject, *, require_coverage: bool = False
) -> str | None:
    # Technology vocabulary is open-ended (Redux Toolkit, Socket.IO, etc.).
    # Use the owning entry's exact stack rather than a global keyword whitelist.
    prose = re.sub(
        r"^(?:skills?|technologies|tools|tech stack|công nghệ)\s*:\s*",
        "",
        text.strip(),
        flags=re.IGNORECASE,
    )
    for technology in sorted(source.technologies, key=len, reverse=True):
        prose = re.sub(rf"(?<!\w){re.escape(technology)}(?!\w)", " ", prose, flags=re.IGNORECASE)
    if not _TOKEN_RE.findall(prose) or _is_generic_bullet(prose):
        return "localization_generic_rejection"
    if require_coverage and source.description:
        # Reject only an obvious short feature fragment, not concise action prose.
        # Sentence/conjunction counts cannot establish semantic completeness: a
        # comma-separated feature list may express the entire source in one sentence.
        source_parts = [
            part
            for part in re.split(r"[.!?;\n]+(?:\s|$)", source.description)
            if _TOKEN_RE.findall(part) and _project_narrative_rejection(part, source) is None
        ]
        if (
            len(source_parts) > 1
            and len(_TOKEN_RE.findall(prose)) <= 8
            and not _RESPONSIBILITY_ACTION_RE.search(prose)
            and not re.search(r"[,;\n]", prose)
        ):
            return "localization_coverage_rejection"
    return None
