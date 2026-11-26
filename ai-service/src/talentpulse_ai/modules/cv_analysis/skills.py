"""Deterministic skill-list tokenization; never mine skills from arbitrary prose."""

import re
from collections.abc import Iterable

SKILL_NORMALIZATION_VERSION = "skill-normalization-v2"

_ALIASES = {
    "postgres": "postgresql",
    "postgre sql": "postgresql",
    "js": "javascript",
    "ts": "typescript",
    "node js": "nodejs",
    "react js": "reactjs",
    "vue js": "vuejs",
    "next js": "nextjs",
    "express js": "expressjs",
    "tailwind css": "tailwindcss",
    "k8s": "kubernetes",
    "amazon web services": "aws",
    "google cloud platform": "gcp",
}
_GROUPS = (
    "front-end",
    "frontend",
    "back-end",
    "backend",
    "database",
    "databases",
    "programming languages",
    "languages",
    "frameworks",
    "tools",
    "technologies",
    "technical skills",
    "soft skills",
    "skills",
    "cơ sở dữ liệu",
    "ngôn ngữ lập trình",
    "ngôn ngữ",
    "công cụ",
    "công nghệ",
    "kỹ năng",
    "kĩ năng",
    "kỹ năng mềm",
)
_GROUP_PREFIX = re.compile(
    r"^(?:"
    + "|".join(re.escape(group) for group in sorted(_GROUPS, key=len, reverse=True))
    + r")(?=\s|[:：]|$)\s*[:：]?\s*",
    re.IGNORECASE,
)
_PROFICIENCY = re.compile(
    r"\s*\((?:beginner|intermediate|advanced|expert|basic|proficient|"
    r"cơ bản|trung cấp|nâng cao|thành thạo)\)\s*$",
    re.IGNORECASE,
)


def canonical_skill(value: str) -> str:
    normalized = value.casefold().strip().replace(".", "")
    normalized = re.sub(r"[-_/]", " ", normalized)
    normalized = " ".join(normalized.split())
    return _ALIASES.get(normalized, normalized)


def _strip_group(value: str) -> str:
    match = _GROUP_PREFIX.match(value)
    if match is None:
        return value
    remainder = value[match.end() :]
    # Without punctuation, a category word can be part of an atomic skill
    # (e.g. "Database design" or "Cloud computing").
    if not remainder or re.search(r"[:：,;|]", value):
        return remainder
    return value


def split_skills(values: Iterable[str]) -> list[str]:
    """Return atomic display names, deduplicated by exact canonical alias equality."""
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        for line in value.splitlines():
            line = re.sub(r"^\s*[-*•·▪►→◆●○■□]\s*", "", line).strip()
            line = _strip_group(line)
            for token in re.split(r"[,;|•·▪►→◆●○■□]", line):
                token = _strip_group(token.strip())
                token = _PROFICIENCY.sub("", token).strip().rstrip(".").strip()
                if _PROFICIENCY.fullmatch(f"({token})"):
                    continue
                key = canonical_skill(token)
                if key and key not in seen:
                    seen.add(key)
                    result.append(token)
    return result
