from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from difflib import SequenceMatcher

_TOKEN_RE = re.compile(r"[A-Za-zÀ-ỹĐđ0-9][A-Za-zÀ-ỹĐđ0-9+#/-]*")
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
_DEDUP_SIMILARITY = 0.94


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
