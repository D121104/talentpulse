from __future__ import annotations

import hashlib
import html
import json
import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from app.core.index_representation import (
    CHUNKING_VERSION,
    INDEX_SCHEMA_VERSION,
    NORMALIZATION_VERSION,
)
from app.schemas.contracts import Salary
from app.schemas.indexing import CanonicalJobSnapshot

__all__ = [
    "CHUNKING_VERSION",
    "DEFAULT_MAX_CHUNK_CHARS",
    "INDEX_SCHEMA_VERSION",
    "MAX_CHUNK_COUNT",
    "NORMALIZATION_VERSION",
    "POINT_NAMESPACE",
    "JobChunk",
    "build_chunks",
    "build_search_text",
    "compute_content_hash",
    "compute_job_content_hash",
    "compute_metadata_hash",
    "normalize_text",
    "normalized_job_metadata",
    "point_id_for_job",
    "point_ids_for_job",
]

DEFAULT_MAX_CHUNK_CHARS = 1_900
MAX_CHUNK_COUNT = 128
POINT_NAMESPACE = uuid5(NAMESPACE_URL, "https://talentpulse.ai/index/jobs")
_MIN_BODY_BUDGET = 128

_HTML_SCRIPT_STYLE_RE = re.compile(
    r"<(?P<tag>script|style)\b[^>]*>.*?</(?P=tag)>", re.IGNORECASE | re.DOTALL
)
_HTML_TAG_RE = re.compile(r"<[^>]*>")
_WHITESPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True, slots=True)
class JobChunk:
    chunk_index: int
    text: str


def normalize_text(value: str | None) -> str:
    """Normalize untrusted job text deterministically and discard markup."""

    if not value:
        return ""
    text = html.unescape(value)
    text = _HTML_SCRIPT_STYLE_RE.sub(" ", text)
    text = _HTML_TAG_RE.sub(" ", text)
    text = unicodedata.normalize("NFKC", text)
    return _WHITESPACE_RE.sub(" ", text).strip().casefold()


def _job_values(job: CanonicalJobSnapshot | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(job, CanonicalJobSnapshot):
        return job.model_dump(mode="python")
    return dict(job)


def _text_value(value: object) -> str:
    return normalize_text(value if isinstance(value, str) else None)


def _utc_iso(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        raw_value = value
        try:
            value = datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
        except ValueError:
            return normalize_text(raw_value) or None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _normalized_skills(values: object) -> list[str]:
    if not isinstance(values, (list, tuple)):
        return []
    unique: set[str] = set()
    for value in values:
        if isinstance(value, str):
            normalized = normalize_text(value)
            if normalized:
                unique.add(normalized)
    return sorted(unique)


def _salary_values(job_values: Mapping[str, Any]) -> tuple[float | int | None, str | None]:
    salary = job_values.get("salary")
    currency = job_values.get("salary_currency")
    amount: object
    if isinstance(salary, Salary):
        amount = salary.amount
        currency = currency if currency is not None else salary.currency
    elif isinstance(salary, Mapping):
        amount = salary.get("amount")
        currency = currency if currency is not None else salary.get("currency")
    else:
        amount = salary
    if isinstance(amount, bool) or not isinstance(amount, (int, float)):
        amount = None
    if isinstance(amount, float) and not amount.is_integer():
        normalized_amount: float | int | None = amount
    elif amount is None:
        normalized_amount = None
    else:
        normalized_amount = int(amount)
    normalized_currency = _text_value(currency)
    if not normalized_currency and normalized_amount is not None:
        normalized_currency = "vnd"
    return normalized_amount, normalized_currency or None


def normalized_job_metadata(job: CanonicalJobSnapshot | Mapping[str, Any]) -> dict[str, Any]:
    """Return only bounded fields needed for retrieval and exact filtering."""

    values = _job_values(job)
    salary, salary_currency = _salary_values(values)
    return {
        "job_id": str(values["job_id"]),
        "company_id": str(values["company_id"]),
        "title": _text_value(values.get("title")),
        "company_name": _text_value(values.get("company_name")),
        "skills": _normalized_skills(values.get("skills")),
        "location": _text_value(values.get("location")) or None,
        "level": _text_value(values.get("level")) or None,
        "work_mode": _text_value(values.get("work_mode")) or None,
        "employment_type": _text_value(values.get("employment_type")) or None,
        "salary": salary,
        "salary_currency": salary_currency,
        "start_date": _utc_iso(values.get("start_date")),
        "end_date": _utc_iso(values.get("end_date")),
        "updated_at": _utc_iso(values.get("updated_at")),
        "is_active": values.get("is_active") is True,
        "is_deleted": values.get("is_deleted") is True,
        "deleted_at": _utc_iso(values.get("deleted_at")),
        "company_is_active": values.get("company_is_active") is True,
        "company_is_deleted": values.get("company_is_deleted") is True,
        "company_deleted_at": _utc_iso(values.get("company_deleted_at")),
    }


def build_search_text(job: CanonicalJobSnapshot | Mapping[str, Any]) -> str:
    """Build normalized semantic input from retrieval-relevant job fields."""

    values = _job_values(job)
    metadata = normalized_job_metadata(values)
    sections = [
        ("title", metadata["title"]),
        ("company", metadata["company_name"]),
        ("level", metadata["level"]),
        ("location", metadata["location"]),
        ("work_mode", metadata["work_mode"]),
        ("employment_type", metadata["employment_type"]),
        ("skills", ", ".join(metadata["skills"])),
        ("description", _text_value(values.get("description"))),
    ]
    return "\n".join(f"{name}: {value}" for name, value in sections if value)


def compute_content_hash(value: str | CanonicalJobSnapshot | Mapping[str, Any]) -> str:
    """Hash the deterministic normalized search representation."""

    text = value if isinstance(value, str) else build_search_text(value)
    return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()


def compute_job_content_hash(job: CanonicalJobSnapshot | Mapping[str, Any]) -> str:
    return compute_content_hash(job)


def compute_metadata_hash(
    job: CanonicalJobSnapshot | Mapping[str, Any],
    *,
    source_version: int = 0,
    embedding_model_version: str = "",
    embedding_dimensions: int = 0,
    normalization_version: str = NORMALIZATION_VERSION,
    chunking_version: str = CHUNKING_VERSION,
    index_schema_version: str = INDEX_SCHEMA_VERSION,
) -> str:
    """Hash canonical filter metadata and representation versions."""

    value = {
        "job": normalized_job_metadata(job),
        "source_version": source_version,
        "embedding_model_version": embedding_model_version,
        "embedding_dimensions": embedding_dimensions,
        "normalization_version": normalization_version,
        "chunking_version": chunking_version,
        "index_schema_version": index_schema_version,
    }
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _split_text(text: str, max_chars: int) -> list[str]:
    if max_chars < 1:
        raise ValueError("max_chars must be positive")
    remaining = text.strip()
    chunks: list[str] = []
    while remaining:
        if len(remaining) <= max_chars:
            chunks.append(remaining)
            break
        boundary = remaining.rfind(" ", 0, max_chars + 1)
        if boundary <= 0:
            boundary = max_chars
        chunks.append(remaining[:boundary].strip())
        remaining = remaining[boundary:].strip()
    return [chunk for chunk in chunks if chunk]


def chunk_text(text: str, *, max_chars: int = DEFAULT_MAX_CHUNK_CHARS) -> list[str]:
    """Split arbitrary text using the deterministic word-boundary policy."""

    return _split_text(normalize_text(text), max_chars)


def _truncate(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    if max_chars <= 1:
        return value[:max_chars]
    return value[: max_chars - 1].rstrip() + "…"


def _build_identity(metadata: Mapping[str, Any], max_chars: int) -> str:
    """Fit identity/filter fields while retaining title and company first."""

    budget = max(1, max_chars - _MIN_BODY_BUDGET)
    fields = [
        ("title", metadata.get("title")),
        ("company", metadata.get("company_name")),
        ("level", metadata.get("level")),
        ("location", metadata.get("location")),
        ("work_mode", metadata.get("work_mode")),
        ("employment_type", metadata.get("employment_type")),
    ]
    values = [(name, value) for name, value in fields if isinstance(value, str) and value]
    if not values:
        return ""

    required = values[:2]
    if len("\n".join(f"{name}: {value}" for name, value in required)) > budget:
        title = _truncate(required[0][1], max(1, budget // 2 - 1))
        company_budget = max(1, budget - len(f"title: {title}\n") - len("company: "))
        company = _truncate(required[1][1], company_budget)
        return f"title: {title}\ncompany: {company}"[:budget].rstrip()

    selected = [f"{name}: {value}" for name, value in required]
    for name, value in values[2:]:
        candidate = "\n".join([*selected, f"{name}: {value}"])
        if len(candidate) <= budget:
            selected.append(f"{name}: {value}")
    return "\n".join(selected)


def build_chunks(
    job: CanonicalJobSnapshot | Mapping[str, Any],
    *,
    max_chars: int = DEFAULT_MAX_CHUNK_CHARS,
) -> list[JobChunk]:
    """Keep ordinary jobs as one point and split long jobs by sections."""

    if max_chars < _MIN_BODY_BUDGET:
        raise ValueError("max_chars must leave room for semantic identity metadata")
    values = _job_values(job)
    search_text = build_search_text(values)
    if len(search_text) <= max_chars:
        return [JobChunk(0, search_text)]

    metadata = normalized_job_metadata(values)
    identity = _build_identity(metadata, max_chars)
    body_sections = [
        ("skills", ", ".join(metadata["skills"])),
        ("description", _text_value(values.get("description"))),
    ]
    body = "\n".join(f"{name}: {value}" for name, value in body_sections if value)
    body_budget = max(1, max_chars - len(identity) - 1)
    if len(identity) >= max_chars:
        identity = _truncate(identity, max_chars)
        body_budget = 1
    body_chunks = _split_text(body, body_budget)
    if not body_chunks:
        body_chunks = _split_text(search_text, max_chars)

    chunks: list[JobChunk] = []
    for body_chunk in body_chunks:
        text = f"{identity}\n{body_chunk}" if identity else body_chunk
        if len(text) <= max_chars:
            chunks.append(JobChunk(len(chunks), text))
            continue
        # Defensive fallback for future section/normalization changes. It is
        # preferable to lose repeated identity on an impossible oversized
        # identity than to send an input above the provider safety limit.
        for piece in _split_text(text, max_chars):
            chunks.append(JobChunk(len(chunks), piece))
    return chunks


def point_id_for_job(
    job_id: UUID | str,
    *,
    chunk_index: int = 0,
    chunked: bool = False,
    chunking_version: str = CHUNKING_VERSION,
) -> str:
    """Use the job UUID for normal jobs and UUIDv5 for deterministic chunks."""

    parsed_job_id = job_id if isinstance(job_id, UUID) else UUID(str(job_id))
    if chunk_index < 0:
        raise ValueError("chunk_index must not be negative")
    if not chunked:
        if chunk_index != 0:
            raise ValueError("single-point jobs only have chunk index zero")
        return str(parsed_job_id)
    return str(uuid5(POINT_NAMESPACE, f"{parsed_job_id}:{chunk_index}:{chunking_version}"))


def point_ids_for_job(
    job_id: UUID | str,
    chunk_count: int,
    *,
    chunking_version: str = CHUNKING_VERSION,
) -> list[str]:
    if chunk_count < 1:
        raise ValueError("chunk_count must be positive")
    chunked = chunk_count > 1
    return [
        point_id_for_job(
            job_id,
            chunk_index=index,
            chunked=chunked,
            chunking_version=chunking_version,
        )
        for index in range(chunk_count)
    ]


# Friendly aliases keep the pure functions discoverable to callers/tests.
normalize_job_text = normalize_text
build_job_search_text = build_search_text
chunk_job = build_chunks
stable_point_id = point_id_for_job
