from __future__ import annotations

import re

from talentpulse_ai.modules.cv_generator.lexical_rules import (
    _TECHNOLOGY_TERMS,
    _TOKEN_RE,
    _target_skill_literal,
    _target_skill_pattern,
)
from talentpulse_ai.modules.cv_generator.locale_validation import (
    _OFFICIAL_CREDENTIAL_TERMS,
    _locale_matches,
    _short_scalar_locale_matches,
    _stable_source_text,
)
from talentpulse_ai.modules.cv_generator.schemas import CvDraftRequest

_SKILL_GROUPS: tuple[tuple[str, str, set[str]], ...] = (
    (
        "Programming",
        "Lập trình",
        {
            "python",
            "sql",
            "java",
            "javascript",
            "typescript",
            "c++",
            "c#",
            "go",
            "rust",
            "php",
            "ruby",
            "kotlin",
        },
    ),
    (
        "Data Engineering",
        "Kỹ thuật dữ liệu",
        {"kafka", "spark", "airflow", "dbt", "etl", "elt", "medallion architecture", "pandas"},
    ),
    (
        "Databases",
        "Cơ sở dữ liệu",
        {"postgresql", "mysql", "clickhouse", "redis", "mongodb", "sqlite", "sql server"},
    ),
    (
        "Frameworks & Libraries",
        "Nền tảng và thư viện",
        {"fastapi", "spring boot", "springboot", "react", "nestjs", "pytorch", "tensorflow"},
    ),
    ("Tools & DevOps", "Công cụ và DevOps", {"docker", "git", "kubernetes", "terraform", "linux"}),
    ("Languages", "Ngoại ngữ", set()),
    ("Other", "Khác", set()),
)
_ORDINARY_SKILL_LABELS = (
    ("Good communication", "Giao tiếp tốt"),
    ("Problem Solving", "Giải quyết vấn đề"),
    ("Team collaboration", "Hợp tác nhóm"),
    ("English", "Tiếng Anh"),
)


def _has_application_target(request: CvDraftRequest) -> bool:
    return request.job.title != "Candidate CV" and bool(
        request.job.required_skills
        or request.job.preferred_skills
        or request.job.company_name
        or request.job.description
        or request.job.location
        or request.job.work_mode
        or request.job.level
    )


def _application_role(request: CvDraftRequest) -> str | None:
    """Bind role metadata to a known label or the untouched canonical job title."""
    if not _has_application_target(request):
        return None
    if not request.locale.casefold().startswith("vi"):
        return request.job.title
    return {
        "machine learning engineer": "Kỹ sư học máy",
        "ml engineer": "Kỹ sư học máy",
        "full stack engineer": "Kỹ sư full-stack",
        "fullstack engineer": "Kỹ sư full-stack",
        "senior full stack engineer": "Kỹ sư full-stack cấp cao",
        "senior fullstack engineer": "Kỹ sư full-stack cấp cao",
        "senior fullstack developer": "Lập trình viên full-stack cấp cao",
        "ai / machine learning engineer (python & pytorch)": (
            "Kỹ sư AI / học máy (Python & PyTorch)"
        ),
        "senior fullstack developer (nodejs / react)": (
            "Lập trình viên full-stack cấp cao (NodeJS / React)"
        ),
    }.get(" ".join(request.job.title.casefold().split()), request.job.title)


def _canonical_skill_member(request: CvDraftRequest, source: str) -> bool:
    normalized = _target_skill_literal(" ".join(source.split())).casefold()
    if (
        normalized in _TECHNOLOGY_TERMS
        or any(normalized in names for _, _, names in _SKILL_GROUPS)
        or normalized
        in {
            "c",
            "c++",
            "c#",
            "spring boot",
            "nodejs",
            "typeorm",
        }
    ):
        return True
    if re.fullmatch(r"(?:toeic|ielts|toefl)\s+[0-9]+(?:[.,][0-9]+)?", source.strip(), re.I):
        return True
    if _stable_source_text(source) and any(
        token.casefold() in _OFFICIAL_CREDENTIAL_TERMS for token in _TOKEN_RE.findall(source)
    ):
        return True
    # Explicit project technology context can establish an otherwise unknown proper name.
    if re.fullmatch(r"[A-Za-z][A-Za-z0-9+#./-]*", source.strip()) and any(
        source == technology
        for row in request.candidate.projects
        for technology in row.technologies
    ):
        return True
    if (
        re.fullmatch(r"[A-Za-z][A-Za-z0-9+#./-]*", source.strip())
        and re.search(r"[a-z][A-Z]", source)
        and any(
            _target_skill_literal(hint.strip()).casefold() == normalized
            for hint in [*request.job.required_skills, *request.job.preferred_skills]
        )
    ):
        return True
    tokens = _TOKEN_RE.findall(source)
    return bool(tokens) and all(
        token.casefold() in _TECHNOLOGY_TERMS or token.casefold() in {"c", "c++", "c#"}
        for token in tokens
    )


def _skill_member_display(request: CvDraftRequest, source: str) -> str | None:
    match = re.fullmatch(r"(\s*)([^()]*?)(\s*\([^()]*\))?(\s*)", source)
    if match:
        leading, base, suffix, trailing = match.groups()
        key = " ".join(base.split()).casefold()
        for english, vietnamese in _ORDINARY_SKILL_LABELS:
            if key not in {english.casefold(), vietnamese.casefold()}:
                continue
            target = vietnamese if request.locale.casefold().startswith("vi") else english
            if suffix:
                qualifier = suffix[suffix.index("(") + 1 : -1]
                credential = bool(
                    re.fullmatch(
                        r"(?:TOEIC|IELTS|TOEFL)\s+[0-9]+(?:[.,][0-9]+)?", qualifier.strip(), re.I
                    )
                )
                if not credential and not (
                    _short_scalar_locale_matches(qualifier, request.locale)
                    and _locale_matches(qualifier, request.locale)
                ):
                    return None
            if key == target.casefold():
                return source
            return leading + target + (suffix or "") + trailing
    if _canonical_skill_member(request, source):
        return source
    return source if _short_scalar_locale_matches(source, request.locale) else None


def _skill_member_is_relevant(request: CvDraftRequest, source: str) -> bool:
    if request.job.title == "Candidate CV":
        return True
    base = re.sub(r"\s*\([^()]*\)\s*$", "", source).strip()
    key = " ".join(base.split()).casefold()
    # Derive a positive search view without changing the canonical job description.
    description_clauses = re.split(
        r"[;!?\n,]|\.(?=\s|$)|\b(?:but|however|nhưng)\b",
        request.job.description or "",
        flags=re.I,
    )
    positive_description = " ".join(
        clause
        for clause in description_clauses
        if not re.search(
            r"\b(?:not\s+(?:required|needed|necessary)|"
            r"(?:do(?:es)?\s+not|don't|doesn't)\s+(?:require|need)|"
            r"no\s+need\s+for|không\s+(?:yêu\s+cầu|cần|bắt\s+buộc))\b",
            clause,
            re.I,
        )
    )
    job_context = " ".join([request.job.title, positive_description])
    job_hints = [*request.job.required_skills, *request.job.preferred_skills]
    all_job_text = " ".join([*job_hints, job_context])
    ordinary_terms = {
        "Good communication": ("communication", "giao tiếp"),
        "Problem Solving": ("problem solving", "giải quyết vấn đề"),
        "Team collaboration": ("team collaboration", "teamwork", "hợp tác nhóm"),
        "English": ("english", "tiếng anh"),
    }
    for english, vietnamese in _ORDINARY_SKILL_LABELS:
        if key in {english.casefold(), vietnamese.casefold()}:
            terms = ordinary_terms[english]
            if english == "English":
                terms = (
                    *terms,
                    *(
                        exam
                        for exam in ("TOEIC", "IELTS", "TOEFL")
                        if re.search(rf"\b{exam}\b", source, re.I)
                    ),
                )
            return any(re.search(_target_skill_pattern(term), all_job_text, re.I) for term in terms)
    if re.search(r"\b(?:toeic|ielts|toefl)\b", source, re.I) and re.search(
        r"\b(?:english|tiếng anh)\b", all_job_text, re.I
    ):
        return True
    if any(
        re.search(rf"\b{exam}\b", source, re.I) and re.search(rf"\b{exam}\b", all_job_text, re.I)
        for exam in ("TOEIC", "IELTS", "TOEFL")
    ):
        return True
    generic = {"data", "software", "engineering", "developer", "skills", "experience"}
    if any(
        hint.strip().casefold() not in generic
        and re.search(_target_skill_pattern(hint.strip()), source, re.I)
        for hint in job_hints
    ):
        return True
    # Job context, never the candidate's other rows, establishes semantic relevance.
    context_terms = {
        term
        for term in [
            *_TECHNOLOGY_TERMS,
            *(name for _, _, names in _SKILL_GROUPS for name in names),
            "NodeJS",
            "TypeORM",
            "API",
        ]
        if term.casefold() not in generic
    }
    for term in context_terms:
        pattern = _target_skill_pattern(term)
        if term.casefold() == "go":
            pattern += r"(?=\s+(?:language|programming)\b)"
        elif term.casefold() == "react":
            pattern += r"(?!\s+to\b)"
        elif term.casefold() == "nestjs":
            pattern = r"(?<!\w)NestJS(?!\w)"
        if re.search(_target_skill_pattern(term), source, re.I) and re.search(
            pattern, job_context, re.I
        ):
            return True
    canonical = _target_skill_literal(key).casefold()
    if not base or key in generic or canonical == "go":
        return False
    pattern = _target_skill_pattern(base)
    if canonical == "react":
        pattern += r"(?!\s+to\b)"
    elif canonical == "nestjs":
        pattern = r"(?<!\w)NestJS(?!\w)"
    return bool(re.search(pattern, job_context, re.I))
