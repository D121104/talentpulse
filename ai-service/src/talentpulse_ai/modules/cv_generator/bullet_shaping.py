from __future__ import annotations

import re
from collections.abc import Iterable

from talentpulse_ai.modules.cv_generator.grounding import (
    _is_generic_bullet,
    _project_narrative_rejection,
)
from talentpulse_ai.modules.cv_generator.lexical_rules import (
    _TECHNOLOGY_TERMS,
    _TOKEN_RE,
    _dedupe_texts,
)
from talentpulse_ai.modules.cv_generator.locale_validation import (
    _locale_matches,
    _stable_source_text,
)
from talentpulse_ai.modules.cv_generator.schemas import CandidateProfile, CandidateProject

_MAX_BULLET_LENGTH = 240


def _split_clauses(text: str) -> list[str]:
    """Split prose at explicit boundaries without changing its factual wording."""
    normalized = re.sub(r"[ \t]+", " ", text.strip())
    if not normalized:
        return []
    parts = re.split(r"(?:\s*[;；]\s*|(?<=[.!?。！？])\s+|\s*\n\s*)", normalized)
    return [part.strip(" \t\r\n-•") for part in parts if part.strip(" \t\r\n-•")]


def _shape_bullet(text: str) -> list[str]:
    """Return short, single-idea fragments while preserving provider/source text."""
    shaped: list[str] = []
    for clause in _split_clauses(text):
        if len(clause) <= _MAX_BULLET_LENGTH:
            shaped.append(clause.rstrip(".。;；") + ("." if clause.endswith((".", "。")) else ""))
            continue
        pieces = re.split(r"\s*(?:,|，|\s+and\s+|\s+và\s+)\s*", clause, flags=re.IGNORECASE)
        pieces = [piece.strip() for piece in pieces if piece.strip()]
        if len(pieces) == 1:
            words = clause.split()
            pieces = []
            current: list[str] = []
            for word in words:
                candidate = " ".join([*current, word])
                if current and len(candidate) > _MAX_BULLET_LENGTH:
                    pieces.append(" ".join(current))
                    current = [word]
                else:
                    current.append(word)
            if current:
                pieces.append(" ".join(current))
        shaped.extend(
            piece.rstrip(".。;；") + ("." if piece.endswith((".", "。")) else "")
            for piece in pieces
        )
    return _dedupe_texts(shaped, limit=4)


def _source_technologies(text: str, technologies: Iterable[str] = ()) -> list[str]:
    values = [
        *technologies,
        *(token for token in _TOKEN_RE.findall(text) if token.casefold() in _TECHNOLOGY_TERMS),
    ]
    return _dedupe_texts(values)


def _fallback_bullets(
    source: object, *, locale: str, kind: str, preserved_literals: Iterable[str] = ()
) -> tuple[list[str], bool]:
    """Build only grounded same-locale bullets; never invent a translated filler sentence."""
    description = getattr(source, "description", None) or ""
    technologies = _source_technologies(description, getattr(source, "technologies", ()))
    clauses = [clause for clause in _split_clauses(description) if not _is_generic_bullet(clause)]
    # A provider repair is required for opposite-locale prose.  Returning a
    # technology-only clause is safe for sparse, language-neutral source data,
    # but labels such as ``Documented technologies`` are misleading filler.
    literals = tuple(preserved_literals)
    if not locale.casefold().startswith("vi"):
        # Retain meaningful English source clauses, including achievements without
        # a verb from our small action vocabulary. Never substitute a role/stack.
        english = [
            bullet
            for clause in clauses
            if _locale_matches(clause, locale, preserved_literals=literals)
            and (
                not isinstance(source, CandidateProject)
                or _project_narrative_rejection(clause, source) is None
            )
            and not re.match(
                r"^(?:skills?|technologies|tools|tech stack)\s*:", clause, re.IGNORECASE
            )
            and not all(
                token.casefold() in _TECHNOLOGY_TERMS
                or token.casefold() in {"apis", "api", "backend", "frontend"}
                for token in _TOKEN_RE.findall(clause)
            )
            for bullet in _shape_bullet(
                _deterministic_rewrite(
                    clause, locale=locale, kind=kind, preserved_literals=literals
                )
                or clause
            )
        ]
        return _dedupe_texts(english), not bool(english)
    if description and not _locale_matches(description, locale, preserved_literals=literals):
        if not _locale_matches(
            description, "en-US", preserved_literals=literals
        ) and not _locale_matches(description, "vi-VN", preserved_literals=literals):
            return ([f"{', '.join(technologies)}."] if technologies else []), True
        position = getattr(source, "position", None) or getattr(source, "role", None)
        if position and _locale_matches(position, locale):
            return [position.rstrip(".。") + "."], True
        return [], True
    actionable = [
        clause
        for clause in clauses
        if re.search(
            r"\b(?:built|developed|designed|implemented|managed|created|maintained|"
            r"led|supported|documented|phát triển|triển khai|thiết kế|vận hành|"
            r"xây dựng|quản lý|hỗ trợ|tài liệu)\b",
            clause,
            re.IGNORECASE,
        )
    ]
    if actionable:
        rewritten = [
            _deterministic_rewrite(clause, locale=locale, kind=kind, preserved_literals=literals)
            for clause in actionable
        ]
        return _dedupe_texts(item for item in rewritten if item), False
    if technologies:
        return [f"{', '.join(technologies)}."], True
    position = getattr(source, "position", None) or getattr(source, "role", None) or description
    if position and len(position) <= _MAX_BULLET_LENGTH:
        return [position.rstrip(".。") + ("." if not position.endswith((".", "。")) else "")], True
    return [], True


def _deterministic_rewrite(
    text: str | None,
    *,
    locale: str,
    kind: str,
    technologies: list[str] | None = None,
    preserved_literals: Iterable[str] = (),
) -> str | None:
    """Create a concise factual fallback without copying the source sentence verbatim."""
    if not text or not text.strip():
        return None
    source = " ".join(text.strip().split()).rstrip(".")
    tech = technologies or _source_technologies(source)
    if locale.casefold().startswith("vi"):
        if _locale_matches(source, locale, preserved_literals=preserved_literals):
            return source + "."
        tech = _source_technologies(source)
        if tech:
            return f"Phát triển nội dung với {', '.join(tech)}."
        return "Thực hiện công việc theo mô tả nguồn."
    # A small factual edit avoids copying a source sentence while preserving its claims.
    rewritten = re.sub(r"\bwith\b", "using", source, count=1, flags=re.IGNORECASE)
    return rewritten + "."


def _fallback_objective(candidate: CandidateProfile, locale: str) -> str | None:
    """Return only same-locale or standalone canonical objective text."""
    source = candidate.career_objective
    if not source or not source.strip():
        return None
    if _locale_matches(source, locale) or _stable_source_text(source):
        return source.strip()
    return None
