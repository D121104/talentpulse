from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from decimal import Decimal
from difflib import SequenceMatcher

from talentpulse_ai.modules.cv_generator.schemas import (
    CandidateEducation,
    CandidateExperience,
    CandidateProfile,
    CandidateProject,
    CvDraftRequest,
    ProviderLocalizedItems,
    ProviderTextValue,
)

_TOKEN_RE = re.compile(r"[A-Za-zÀ-ỹĐđ0-9][A-Za-zÀ-ỹĐđ0-9+#/-]*")
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
_VIETNAMESE_SHORT_PHRASES = frozenset(
    {
        "ky su",
        "du lieu",
        "cu nhan",
        "khoa hoc",
        "may tinh",
        "quan ly",
        "phat trien",
        "du an",
        "chung chi",
        "giai thuong",
        "nha phat trien",
        "tinh nguyen",
        "cong dong",
        "tot nghiep",
        "xuat sac",
        "ky nang",
        "hoat dong",
        "to chuc",
        "sinh vien",
        "tuyen dung",
        "xay dung",
        "thiet ke",
        "trien khai",
        "van hanh",
        "ho tro",
        "tai lieu",
        "quy trinh",
        "phat hanh",
        "mo ta",
        "nang luc",
        "nghe nghiep",
    }
)
_VIETNAMESE_SHORT_TOKENS = frozenset(
    {
        "ky",
        "su",
        "du",
        "lieu",
        "cu",
        "nhan",
        "khoa",
        "hoc",
        "may",
        "tinh",
        "quan",
        "ly",
        "phat",
        "trien",
        "an",
        "chung",
        "chi",
        "giai",
        "thuong",
        "nha",
        "vien",
        "nguyen",
        "cong",
        "dong",
        "tot",
        "nghiep",
        "xuat",
        "sac",
        "nang",
        "luc",
        "hoat",
        "to",
        "chuc",
        "sinh",
        "tuyen",
        "dung",
        "xay",
        "thiet",
        "ke",
        "khai",
        "van",
        "hanh",
        "ho",
        "tro",
        "tai",
        "quy",
        "trinh",
        "mo",
        "ta",
        "nghe",
    }
)

_TECHNOLOGY_TERMS = frozenset(
    {
        "python",
        "fastapi",
        "postgresql",
        "postgres",
        "pgsql",
        "restapi",
        "apis",
        "api",
        "etl",
        "backend",
        "docker",
        "kafka",
        "airflow",
        "springboot",
        "dbt",
        "react",
        "pytorch",
        "tensorflow",
        "nestjs",
        "transformers",
        "nlp",
        "typescript",
        "javascript",
        "java",
        "aws",
        "azure",
        "gcp",
        "django",
        "kubernetes",
        "sql",
        "mongodb",
        "qdrant",
    }
)
_LOCALE_TECHNOLOGY_TERMS = frozenset(_TECHNOLOGY_TERMS)


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


def _locale_matches(text: str, locale: str, *, preserved_literals: Iterable[str] = ()) -> bool:
    """Reject meaningful cross-language boilerplate, not technical proper nouns."""
    for literal in sorted(set(preserved_literals), key=len, reverse=True):
        if literal.strip():
            text = re.sub(rf"(?<!\w){re.escape(literal)}(?!\w)", " ", text, flags=re.IGNORECASE)
    vi = locale.casefold().startswith("vi")
    words = {word.casefold() for word in re.findall(r"[A-Za-zÀ-ỹĐđ]+", text)}
    words -= _LOCALE_TECHNOLOGY_TERMS
    vi_markers = words & {
        "và",
        "của",
        "trong",
        "với",
        "đã",
        "được",
        "thực",
        "hiện",
        "phát",
        "triển",
        "áp",
        "dụng",
        "đảm",
        "nhiệm",
        "nội",
        "dung",
        "chính",
        "cung",
        "cấp",
        "mục",
        "tiêu",
        "nghề",
        "nghiệp",
        "hồ",
        "sơ",
        "năng",
        "lực",
        "sử",
        "công",
        "việc",
        "dự",
        "án",
        "kỹ",
        "sư",
        "cử",
        "nhân",
        "thạc",
        "sĩ",
        "đại",
        "học",
        "khoa",
        "bách",
        "ngành",
        "mô",
        "tả",
        "tốt",
        "tình",
        "nguyện",
        "giải",
        "thưởng",
        "viên",
        "nhà",
        "minh",
        "xuất",
        "sắc",
        "tuyển",
        "cộng",
        "đồng",
        "chứng",
        "chỉ",
        "hoạt",
        "động",
        "tổ",
        "chức",
        "máy",
        "tính",
        "dữ",
        "liệu",
    }
    en_markers = words & {
        "and",
        "with",
        "the",
        "in",
        "for",
        "of",
        "built",
        "developed",
        "implemented",
        "applied",
        "delivered",
        "documented",
        "career",
        "objective",
        "based",
        "supplied",
        "profile",
        "experience",
        "project",
        "projects",
        "work",
        "responsibilities",
        "services",
        "engineer",
        "developer",
        "analyst",
        "manager",
        "backend",
        "data",
        "bachelor",
        "master",
        "degree",
        "computer",
        "science",
        "engineering",
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
    }
    if vi_markers and en_markers:
        return False
    if vi:
        return not en_markers
    return not vi_markers


def _without_diacritics(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return (
        "".join(character for character in normalized if unicodedata.category(character) != "Mn")
        .replace("đ", "d")
        .replace("Đ", "D")
        .casefold()
    )


def _has_vietnamese_diacritic(value: str) -> bool:
    return bool(re.search(r"[À-ỹĐđ]", value))


def _has_vietnamese_short_signal(value: str) -> bool:
    normalized = " ".join(_without_diacritics(value).split())
    if any(f" {phrase} " in f" {normalized} " for phrase in _VIETNAMESE_SHORT_PHRASES):
        return True
    tokens = set(re.findall(r"[a-z]+", normalized))
    return len(tokens & _VIETNAMESE_SHORT_TOKENS) >= 2


def _short_scalar_locale_matches(text: str, locale: str) -> bool:
    """Validate short labels without treating canonical tech names as prose."""
    if locale.casefold().startswith("vi"):
        return _has_vietnamese_diacritic(text) or _has_vietnamese_short_signal(text)
    return not _has_vietnamese_diacritic(text) and not _has_vietnamese_short_signal(text)


def _ordinary_title_case_scalar(value: str) -> bool:
    """Allow short translated labels such as ``Backend Engineer`` or ``Data Platform``."""
    tokens = _TOKEN_RE.findall(value)
    if not tokens or len(tokens) > 8:
        return False
    connectors = {"a", "an", "and", "of", "the", "to", "in", "for", "with", "và", "của"}
    return all(
        token.casefold() in connectors
        or token.isupper()
        or (token[:1].isupper() and token[1:].islower())
        for token in tokens
    )


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


def _target_skill_literal(skill: str) -> str:
    # Match transferable API/database evidence without claiming an unowned framework.
    return {
        "api": "API",
        "apis": "API",
        "restapi": "API",
        "rest api": "API",
        "restful api": "API",
        "pgsql": "PostgreSQL",
        "postgres": "PostgreSQL",
        "pg": "PostgreSQL",
        "node.js": "NodeJS",
        "nodejs": "NodeJS",
        "react.js": "React",
        "reactjs": "React",
        "springboot": "Spring Boot",
        "nest": "NestJS",
    }.get(skill.casefold(), skill)


def _target_skill_pattern(skill: str) -> str:
    literal = _target_skill_literal(skill)
    term = {
        "api": r"(?:REST\s*API|RESTful\s+API|APIs?)",
        "postgresql": r"(?:PostgreSQL|Postgres|PgSQL|Pg)",
        "nodejs": r"(?:NodeJS|Node\.js)",
        "react": r"(?:React(?:\.js)?)",
        "nestjs": r"(?:NestJS|Nest)",
        "spring boot": r"(?:Spring\s+Boot|SpringBoot)",
        "data pipeline": r"(?:data pipelines?|luồng dữ liệu)",
        "data warehouse": r"(?:data warehouses?|kho dữ liệu)",
    }.get(literal.casefold(), re.escape(literal))
    if literal.casefold() == "c":
        return rf"(?<!\w){term}(?![\w+#])"
    return rf"(?<!\w){term}(?!\w)"


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


_COMMON_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "as",
        "at",
        "by",
        "for",
        "from",
        "in",
        "of",
        "on",
        "or",
        "the",
        "to",
        "with",
        "và",
        "các",
        "cho",
        "của",
        "chứng",
        "chỉ",
        "hoạt",
        "động",
        "tổ",
        "chức",
        "đã",
        "được",
        "là",
        "một",
        "với",
    }
)
_OFFICIAL_CREDENTIAL_TERMS = frozenset(
    {
        "associate",
        "certified",
        "certificate",
        "certification",
        "credential",
        "license",
        "licence",
        "practitioner",
        "professional",
        "specialist",
    }
)
_DEDUP_SIMILARITY = 0.94
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
_SHORT_SCALAR_FIELDS = frozenset(
    {
        ("headline", "headline"),
        ("application", "title"),
        ("education", "degree"),
        ("education", "major"),
        ("education", "description"),
        ("experience", "position"),
        ("projects", "project_name"),
        ("projects", "role"),
        ("skills", "name"),
        ("skills", "description"),
        ("certificates", "text"),
        ("activities", "text"),
        ("awards", "text"),
    }
)


def _content_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = re.sub(r"[^\w+#]+", " ", normalized, flags=re.UNICODE)
    return " ".join(normalized.split())


def _near_duplicate(left: str, right: str) -> bool:
    left_key = _content_key(left)
    right_key = _content_key(right)
    if not left_key or not right_key:
        return False
    if left_key == right_key:
        return True
    if abs(len(left_key) - len(right_key)) > 12:
        return False
    return SequenceMatcher(None, left_key, right_key).ratio() >= _DEDUP_SIMILARITY


def _dedupe_texts(
    values: Iterable[str], *, exclude: Iterable[str] = (), limit: int | None = None
) -> list[str]:
    excluded = tuple(exclude)
    result: list[str] = []
    for value in values:
        cleaned = " ".join(value.split()).strip()
        if not cleaned or any(_near_duplicate(cleaned, item) for item in excluded):
            continue
        if any(_near_duplicate(cleaned, item) for item in result):
            continue
        result.append(cleaned)
        if limit is not None and len(result) >= limit:
            break
    return result


def _tokens(values: Iterable[str]) -> set[str]:
    return {
        token.casefold()
        for value in values
        for token in _TOKEN_RE.findall(value)
        if token.casefold() not in _COMMON_WORDS and len(token) > 2
    }


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
    return bool(_GENERIC_BULLET_RE.search(" ".join(text.split())))


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


def _stable_source_text(value: str) -> bool:
    """Identify standalone literals without freezing prose around canonical anchors."""
    stripped = " ".join(value.split()).strip()
    if not stripped:
        return False
    if stripped.casefold() == "spring boot":
        return True
    if re.fullmatch(r"(?:https?://|www\.)[^\s<>\"]+", stripped, re.IGNORECASE):
        return True
    if re.fullmatch(r"(?:19|20)\d{2}(?:[-/]\d{1,2})?", stripped):
        return True
    tokens = _TOKEN_RE.findall(stripped)
    if not tokens:
        return False
    folded = [token.casefold() for token in tokens]
    if all(
        token in _TECHNOLOGY_TERMS or raw.isupper()
        for raw, token in zip(tokens, folded, strict=True)
    ):
        return True
    # Preserve recognizable official credential titles, but not Vietnamese labels
    # such as ``Chứng chỉ Docker Associate`` whose descriptive prefix is translatable.
    if (
        not _has_vietnamese_diacritic(stripped)
        and not _has_vietnamese_short_signal(stripped)
        and any(token in _OFFICIAL_CREDENTIAL_TERMS for token in folded)
        and all(
            token in _TECHNOLOGY_TERMS
            or token in _OFFICIAL_CREDENTIAL_TERMS
            or token in {"for", "in", "on", "of"}
            or raw.isupper()
            or (raw[:1].isupper() and raw[1:].islower())
            for raw, token in zip(tokens, folded, strict=True)
        )
    ):
        return True
    return False


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


def _source_locale_matches(
    source: str,
    locale: str,
    section: str,
    field: str,
    *,
    preserved_literals: Iterable[str] = (),
) -> bool:
    if (section, field) in _SHORT_SCALAR_FIELDS:
        return _short_scalar_locale_matches(source, locale)
    return _locale_matches(source, locale, preserved_literals=preserved_literals)


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
        normalized_value in _GENERIC_LOCALIZATION_VALUES
        or normalized_value in _GENERIC_SECTION_VALUES.get(section, set())
    ):
        return None, "localization_generic_rejection"
    evidence = _source_localization_evidence(request, section, source_index)
    rejection = _grounding_rejection_reason(
        value,
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
        if not source_anchors.issubset(_protected_anchors([value])):
            return None, "localization_anchor_rejection"
        for entity in _canonical_named_entities(request.candidate):
            if entity.casefold() == source.casefold():
                continue
            if _contains_named_entity(source, entity) and not _contains_named_entity(value, entity):
                return None, "localization_named_entity_rejection"
    return " ".join(value.split()).strip(), None
