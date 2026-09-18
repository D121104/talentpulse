from __future__ import annotations

import hashlib
import re
from collections.abc import Callable
from datetime import UTC, datetime
from html import unescape
from typing import Final
from uuid import UUID

from app.core.errors import ServiceError
from app.domain.indexing import (
    CanonicalJobSnapshot,
    DocumentEmbeddingProvider,
    IndexIdentity,
    IndexJobDeleteRequest,
    IndexJobResponse,
    IndexJobUpsertRequest,
    JobVectorWriter,
)

NORMALIZATION_VERSION: Final = "job-normalization-v2"
_TAG_RE = re.compile(r"<[^>]{0,256}>")
_SPACE_RE = re.compile(r"\s+")


def normalize_job_text(value: str) -> str:
    """Apply the byte-stable backend/FastAPI job representation normalization."""
    # Python's stdlib decoder follows the HTML5 named/numeric entity table used by
    # NestJS's `entities.decodeHTML`, including legacy references and replacements.
    decoded = unescape(value)
    return _SPACE_RE.sub(" ", _TAG_RE.sub(" ", decoded)).strip()


def build_job_document(job: CanonicalJobSnapshot) -> str:
    parts = [
        ("title", job.title),
        ("description", job.description),
        (
            "skills",
            ", ".join(sorted(filter(None, (normalize_job_text(item) for item in job.skills)))),
        ),
        ("company", job.company_name),
        ("location", job.location or ""),
        ("level", job.level or ""),
        ("work_mode", job.work_mode or ""),
        ("employment_type", job.employment_type or ""),
    ]
    return "\n".join(f"{key}: {normalize_job_text(value)}" for key, value in parts if value)


def compute_content_hash(document: str) -> str:
    return hashlib.sha256(document.encode()).hexdigest()


def stable_job_point_id(job_id: UUID, representation_version: str) -> UUID:
    """Match the canonical backend deterministic UUID for the active index version."""
    digest = hashlib.sha256(
        f"talentpulse:{representation_version}:job:{job_id}".encode()
    ).hexdigest()
    return UUID(f"{digest[:8]}-{digest[8:12]}-4{digest[13:16]}-8{digest[17:20]}-{digest[20:32]}")


def _safe_payload(
    job: CanonicalJobSnapshot, request: IndexJobUpsertRequest, point_id: UUID
) -> dict[str, object]:
    """Build the retrieval-only payload; description is deliberately excluded."""
    return {
        "job_id": str(job.job_id),
        "company_id": str(job.company_id),
        "title": job.title,
        "company_name": job.company_name,
        "location": job.location,
        "level": job.level,
        "work_mode": job.work_mode,
        "employment_type": job.employment_type,
        "skills": sorted(filter(None, (normalize_job_text(item) for item in job.skills))),
        "salary": job.salary,
        "salary_currency": job.salary_currency,
        "start_date": job.start_date.isoformat() if job.start_date else None,
        "end_date": job.end_date.isoformat() if job.end_date else None,
        "start_date_epoch_ms": job.start_date_epoch_ms,
        "end_date_epoch_ms": job.end_date_epoch_ms,
        "is_active": job.is_active,
        "is_deleted": job.is_deleted,
        "status": "DELETED" if job.is_deleted else ("ACTIVE" if job.is_active else "INACTIVE"),
        "company_is_active": job.company_is_active,
        "company_is_deleted": job.company_is_deleted,
        "content_hash": request.content_hash.lower(),
        "source_version": request.source_version,
        "representation_version": request.representation_version,
        "index_version": request.representation_version,
        "normalization_version": NORMALIZATION_VERSION,
        "point_id": str(point_id),
    }


class JobIndexingService:
    """Application port for one-job indexing; it persists no business data."""

    def __init__(
        self,
        embedding: DocumentEmbeddingProvider,
        vector: JobVectorWriter,
        *,
        clock: Callable[[], int] | None = None,
    ) -> None:
        self._embedding = embedding
        self._vector = vector
        self._clock = clock or _utc_now_ms
        self._retries: dict[tuple[str, str], tuple[str, IndexJobResponse]] = {}
        model_dimensions = getattr(embedding, "dimensions", None)
        vector_dimensions = getattr(vector, "dimensions", None)
        if not isinstance(model_dimensions, int) or isinstance(model_dimensions, bool):
            raise ValueError("embedding dimensions are not configured")
        if model_dimensions != vector_dimensions:
            raise ValueError("embedding and vector dimensions do not match")
        self._dimensions = model_dimensions

    def upsert(self, request: IndexJobUpsertRequest) -> IndexJobResponse:
        job = request.job
        point_id = stable_job_point_id(job.job_id, request.representation_version)
        fingerprint = self._fingerprint(request)
        cached = self._cached("UPSERT", request.idempotency_key, fingerprint, request.identity)
        if cached is not None:
            return cached
        document = build_job_document(job)
        computed_hash = compute_content_hash(document)
        if computed_hash != request.content_hash.lower():
            raise ServiceError(
                "invalid_index_request", "content_hash does not match the job document.", 422
            )
        model_name = self._required_metadata("model_name", "embedding model")
        provider_name = self._required_metadata("provider_name", "embedding provider")
        if not self._date_window_active(job):
            try:
                self._vector.delete_point(str(point_id))
            except Exception as exc:
                raise ServiceError(
                    "index_unavailable", "Job indexing is temporarily unavailable.", 503
                ) from exc
            response = IndexJobResponse(
                request_id=request.identity.request_id,
                trace_id=request.identity.trace_id,
                operation_attempt_id=request.identity.operation_attempt_id,
                job_id=job.job_id,
                operation="UPSERT",
                status="SKIPPED_INACTIVE",
                source_version=request.source_version,
                representation_version=request.representation_version,
                point_id=point_id,
                content_hash=None,
                embedding_provider=provider_name,
                embedding_model=model_name,
                embedding_dimensions=self._dimensions,
                embedded=False,
            )
            self._remember("UPSERT", request.idempotency_key, fingerprint, response)
            return response
        try:
            embed_document = self._embedding.embed_document
            vector = embed_document(document)
            if len(vector) != self._dimensions:
                raise ValueError("embedding dimensions do not match configuration")
            if not all(
                isinstance(item, (int, float)) and not isinstance(item, bool) for item in vector
            ):
                raise ValueError("embedding values are invalid")
            payload = _safe_payload(job, request, point_id)
            self._vector.upsert_point(str(point_id), vector, payload)
        except ServiceError:
            raise
        except Exception as exc:
            raise ServiceError(
                "index_unavailable", "Job indexing is temporarily unavailable.", 503
            ) from exc
        response = IndexJobResponse(
            request_id=request.identity.request_id,
            trace_id=request.identity.trace_id,
            operation_attempt_id=request.identity.operation_attempt_id,
            job_id=job.job_id,
            operation="UPSERT",
            status="INDEXED",
            source_version=request.source_version,
            representation_version=request.representation_version,
            point_id=point_id,
            content_hash=request.content_hash.lower(),
            embedding_provider=provider_name,
            embedding_model=model_name,
            embedding_dimensions=self._dimensions,
            embedded=True,
        )
        self._remember("UPSERT", request.idempotency_key, fingerprint, response)
        return response

    def delete(self, request: IndexJobDeleteRequest) -> IndexJobResponse:
        point_id = stable_job_point_id(request.job_id, request.representation_version)
        fingerprint = self._fingerprint(request)
        cached = self._cached("DELETE", request.idempotency_key, fingerprint, request.identity)
        if cached is not None:
            return cached
        try:
            self._vector.delete_point(str(point_id))
        except Exception as exc:
            raise ServiceError(
                "index_unavailable", "Job indexing is temporarily unavailable.", 503
            ) from exc
        response = IndexJobResponse(
            request_id=request.identity.request_id,
            trace_id=request.identity.trace_id,
            operation_attempt_id=request.identity.operation_attempt_id,
            job_id=request.job_id,
            operation="DELETE",
            status="DELETED",
            source_version=request.source_version,
            representation_version=request.representation_version,
            point_id=point_id,
            embedding_provider=self._required_metadata("provider_name", "embedding provider"),
            embedding_model=self._required_metadata("model_name", "embedding model"),
            embedding_dimensions=self._dimensions,
            embedded=False,
        )
        self._remember("DELETE", request.idempotency_key, fingerprint, response)
        return response

    def _date_window_active(self, job: CanonicalJobSnapshot) -> bool:
        if (
            not job.is_active
            or job.is_deleted
            or not job.company_is_active
            or job.company_is_deleted
        ):
            return False
        now_ms = self._clock()
        if isinstance(now_ms, bool) or not isinstance(now_ms, int):
            raise ServiceError("invalid_clock", "Indexing clock returned an invalid value.", 500)
        if job.start_date_epoch_ms is None or job.end_date_epoch_ms is None:
            return True
        return job.start_date_epoch_ms <= now_ms < job.end_date_epoch_ms

    def _required_metadata(self, name: str, label: str) -> str:
        value = getattr(self._embedding, name, None)
        if not isinstance(value, str) or not value.strip() or len(value) > 128:
            raise ServiceError("index_unavailable", f"Configured {label} is invalid.", 503)
        return value.strip()

    @staticmethod
    def _fingerprint(request: IndexJobUpsertRequest | IndexJobDeleteRequest) -> str:
        data = request.model_dump(mode="json")
        data.pop("idempotency_key", None)
        data.pop("identity", None)
        encoded = repr(sorted(data.items()))
        return hashlib.sha256(encoded.encode()).hexdigest()

    def _cached(
        self, operation: str, key: str, fingerprint: str, identity: IndexIdentity
    ) -> IndexJobResponse | None:
        cached = self._retries.get((operation, key))
        if cached is None:
            return None
        if cached[0] != fingerprint:
            raise ServiceError("idempotency_conflict", "Idempotency key was reused.", 409)
        # Correlation/attempt IDs belong to this delivery. Rebind them on replay while
        # retaining the original operation result and avoiding provider writes.
        return cached[1].model_copy(
            update={
                "request_id": identity.request_id,
                "trace_id": identity.trace_id,
                "operation_attempt_id": identity.operation_attempt_id,
            }
        )

    def _remember(
        self, operation: str, key: str, fingerprint: str, response: IndexJobResponse
    ) -> None:
        if len(self._retries) >= 4096:
            self._retries.pop(next(iter(self._retries)))
        self._retries[(operation, key)] = (fingerprint, response)


def _utc_now_ms() -> int:
    epoch = datetime(1970, 1, 1, tzinfo=UTC)
    delta = datetime.now(UTC) - epoch
    return delta.days * 86_400_000 + delta.seconds * 1_000 + delta.microseconds // 1_000
