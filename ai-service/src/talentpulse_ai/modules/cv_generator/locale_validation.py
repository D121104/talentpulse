from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

from talentpulse_ai.modules.cv_generator.lexical_rules import _TECHNOLOGY_TERMS, _TOKEN_RE

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
_LOCALE_TECHNOLOGY_TERMS = frozenset(_TECHNOLOGY_TERMS)
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


def _locale_matches(text: str, locale: str, *, preserved_literals: Iterable[str] = ()) -> bool:
    """Reject meaningful cross-language boilerplate, not technical proper nouns."""
    for literal in sorted(set(preserved_literals), key=len, reverse=True):
        if literal.strip():
            text = re.sub(rf"(?<!\w){re.escape(literal)}(?!\w)", " ", text, flags=re.IGNORECASE)
    vi = locale.casefold().startswith("vi")
    # The old keyword list missed achievements such as “Tăng ... lên ...”.
    # Owned names were removed above. Use Vietnamese-specific characters, not
    # arbitrary accents in English loanwords or symbols such as multiplication.
    if not vi and _has_vietnamese_diacritic(text):
        return False
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
    vietnamese_characters = "ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịỏọốồổỗộớờởỡợụủứừửữựỳỵỷỹ"
    normalized = unicodedata.normalize("NFC", value).casefold()
    return any(character in vietnamese_characters for character in normalized)


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
