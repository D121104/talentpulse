from uuid import UUID, uuid4

from talentpulse_ai.core.config import Settings
from talentpulse_ai.modules.job_indexing.schemas import (
    CanonicalJobSnapshot,
    IndexIdentity,
    IndexJobDeleteRequest,
    IndexJobUpsertRequest,
)
from talentpulse_ai.modules.rag_chatbot.ingestion.indexer import (
    build_job_document,
    compute_content_hash,
)


class FakeEmbedding:
    dimensions = 4
    provider_name = "fake"
    model_name = "fake-document-v1"

    def __init__(self, vector: list[float] | None = None) -> None:
        self.calls: list[str] = []
        self.vector = vector or [0.1, 0.2, 0.3, 0.4]

    def embed_document(self, text: str) -> list[float]:
        self.calls.append(text)
        return list(self.vector)


class FakeVector:
    dimensions = 4

    def __init__(self) -> None:
        self.upserts: list[tuple[str, list[float], dict[str, object]]] = []
        self.deletes: list[str] = []

    def upsert_point(self, point_id: str, vector: list[float], payload: dict[str, object]) -> None:
        self.upserts.append((point_id, list(vector), dict(payload)))

    def delete_point(self, point_id: str) -> None:
        self.deletes.append(point_id)


class FakeGeneration:
    def generate(self, prompt: str) -> object:
        del prompt
        return None


def indexing_settings(*, auth_required: bool = False) -> Settings:
    return Settings(
        auth_required=auth_required,
        jwt_secret="local-test-secret-that-is-long-enough",
        jwt_algorithms=("HS256",),
        jwt_subject="indexer",
    )


def make_job() -> CanonicalJobSnapshot:
    return CanonicalJobSnapshot(
        job_id=uuid4(),
        title="Python Engineer",
        description="Build reliable services.",
        skills=["Python", "PostgreSQL"],
        company_id=uuid4(),
        company_name="Acme",
        location="Hanoi",
        level="mid",
        work_mode="hybrid",
        employment_type="full-time",
        salary=2500,
        salary_currency="USD",
        start_date="2025-01-01T00:00:00Z",
        end_date="2028-01-01T00:00:00Z",
        start_date_epoch_ms=1735689600000,
        end_date_epoch_ms=1830297600000,
        is_active=True,
        is_deleted=False,
        company_is_active=True,
        company_is_deleted=False,
    )


def make_identity() -> IndexIdentity:
    return IndexIdentity(request_id=uuid4(), trace_id=uuid4(), operation_attempt_id=uuid4())


def make_upsert(
    *, job: CanonicalJobSnapshot | None = None, key: str = "index-key"
) -> IndexJobUpsertRequest:
    active_job = job or make_job()
    document = build_job_document(active_job)
    return IndexJobUpsertRequest(
        identity=make_identity(),
        job=active_job,
        idempotency_key=key,
        source_version="source-v1",
        representation_version="demo-v1",
        content_hash=compute_content_hash(document),
    )


def make_delete(job_id: UUID, *, key: str = "delete-key") -> IndexJobDeleteRequest:
    return IndexJobDeleteRequest(
        identity=make_identity(),
        job_id=job_id,
        idempotency_key=key,
        source_version="source-v1",
        representation_version="demo-v1",
    )
