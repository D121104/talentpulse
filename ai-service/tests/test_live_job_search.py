from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from evals.job_search import load_dataset
from evals.live_job_search import (
    CURRENT_INDEX_VERSION,
    DEFAULT_OLLAMA_URL,
    DEFAULT_QDRANT_URL,
    REQUIRED_DIMENSIONS,
    REQUIRED_OLLAMA_MODEL,
    TEMP_COLLECTION_PREFIX,
    LiveEvaluationConfig,
    aggregate_pipeline_metrics,
    assert_temporary_collection_name,
    generate_temporary_collection_name,
    parse_cli,
    run_live_evaluation,
    validate_service_url,
)

DATASET = Path(__file__).parents[1] / "evals" / "datasets" / "job_search_eval_v1.json"


class FakeEmbedding:
    provider_name = "ollama"
    model_name = REQUIRED_OLLAMA_MODEL
    dimensions = REQUIRED_DIMENSIONS

    def __init__(self, *, fail_document: bool = False) -> None:
        self.fail_document = fail_document
        self.query_calls = 0
        self.document_calls = 0

    def _vector(self) -> list[float]:
        return [0.0] * self.dimensions

    def embed_query(self, text: str) -> list[float]:
        del text
        self.query_calls += 1
        return self._vector()

    def embed_document(self, text: str) -> list[float]:
        del text
        self.document_calls += 1
        if self.fail_document:
            raise RuntimeError("provider fixture failure")
        return self._vector()


class FakeQdrant:
    def __init__(self) -> None:
        self.collections: dict[str, dict[str, Any]] = {}
        self.deleted: list[str] = []
        self.indexes: list[tuple[str, str, object]] = []
        self.query_filters: list[object] = []

    def create_collection(self, **kwargs: object) -> None:
        name = kwargs["collection_name"]
        assert isinstance(name, str)
        assert name not in self.collections
        self.collections[name] = {"points": {}}

    def create_payload_index(self, **kwargs: object) -> None:
        self.indexes.append(
            (str(kwargs["collection_name"]), str(kwargs["field_name"]), kwargs["field_schema"])
        )

    def upsert(self, **kwargs: object) -> None:
        name = kwargs["collection_name"]
        points = kwargs["points"]
        assert isinstance(name, str)
        assert name in self.collections
        assert isinstance(points, list)
        for point in points:
            self.collections[name]["points"][str(point.id)] = point

    def count(self, **kwargs: object) -> dict[str, int]:
        name = kwargs["collection_name"]
        assert isinstance(name, str)
        return {"count": len(self.collections.get(name, {}).get("points", {}))}

    def delete(self, **kwargs: object) -> None:
        name = kwargs["collection_name"]
        selector = kwargs["points_selector"]
        assert isinstance(name, str)
        assert name in self.collections
        for point_id in selector.points:
            self.collections[name]["points"].pop(str(point_id), None)

    def query_points(self, **kwargs: object) -> dict[str, list[dict[str, object]]]:
        name = kwargs["collection_name"]
        self.query_filters.append(kwargs["query_filter"])
        assert isinstance(name, str)
        points = self.collections[name]["points"].values()
        return {"points": [{"payload": point.payload or {}, "score": 0.5} for point in points]}

    def delete_collection(self, **kwargs: object) -> None:
        name = kwargs["collection_name"]
        assert isinstance(name, str)
        self.deleted.append(name)
        self.collections.pop(name, None)

    def collection_exists(self, name: str) -> bool:
        return name in self.collections


def test_service_urls_are_loopback_only_by_default() -> None:
    for url in ("http://127.0.0.1:11435", "http://localhost:6333", "http://[::1]:6333"):
        validate_service_url(url, "provider")

    with pytest.raises(ValueError, match="loopback"):
        validate_service_url("https://qdrant.example", "Qdrant URL")
    with pytest.raises(ValueError, match="credentials"):
        validate_service_url("http://user:password@127.0.0.1:6333", "Qdrant URL")
    with pytest.raises(ValueError, match="invalid port"):
        validate_service_url("http://127.0.0.1:not-a-port", "Qdrant URL")
    validate_service_url("https://qdrant.example", "Qdrant URL", allow_non_loopback=True)


def test_temporary_collection_guard_rejects_primary_and_non_generated_names() -> None:
    generated = generate_temporary_collection_name()
    assert generated.startswith(TEMP_COLLECTION_PREFIX)
    assert_temporary_collection_name(generated)

    for name in (
        "jobs_current_local",
        "jobs_ollama_1024_local_v1",
        "jobs_cohere_multilingual_v3_1024_demo_v1",
        "tp_eval_qwen3_embedding_v1_not-a-uuid",
    ):
        with pytest.raises(ValueError):
            assert_temporary_collection_name(name)


def test_report_aggregation_uses_fixture_labels_and_latency_percentiles() -> None:
    dataset = load_dataset(DATASET)
    rankings = {query["query_id"]: [] for query in dataset["queries"]}
    report = aggregate_pipeline_metrics(
        dataset,
        rankings,
        latencies={
            "q01": {"embedding": 2.0, "search": 4.0, "total": 8.0},
            "q02": {"embedding": 6.0, "search": 10.0, "total": 20.0},
        },
    )

    assert report["failure_count"] == 0
    assert report["macro"]["recall_at_1"] < 1.0
    assert report["macro"]["mrr"] < 1.0
    assert set(report["subgroups"]) >= {"locale:en", "filter:structured", "filter:none"}
    assert report["latency_ms"]["embedding"]["p50_ms"] == 4.0
    assert report["latency_ms"]["total"]["p95_ms"] == 19.4
    assert set(report["query_metrics"]) == {query["query_id"] for query in dataset["queries"]}


def test_config_and_cli_validation_are_explicit() -> None:
    config = parse_cli([])
    assert config.ollama_url == DEFAULT_OLLAMA_URL
    assert config.qdrant_url == DEFAULT_QDRANT_URL
    assert config.model == REQUIRED_OLLAMA_MODEL
    assert config.dimensions == REQUIRED_DIMENSIONS
    assert config.index_version == CURRENT_INDEX_VERSION

    with pytest.raises(ValueError, match="loopback"):
        parse_cli(["--qdrant-url", "https://qdrant.example"])
    with pytest.raises(ValueError, match="requires model"):
        parse_cli(["--model", "embeddinggemma:300m"])
    with pytest.raises(ValueError, match="1024"):
        parse_cli(["--dimensions", "768"])


def test_cleanup_runs_after_success_and_report_contains_all_pipelines() -> None:
    client = FakeQdrant()
    embedding = FakeEmbedding()
    collection = f"{TEMP_COLLECTION_PREFIX}{'a' * 32}"
    report = run_live_evaluation(
        LiveEvaluationConfig(),
        qdrant_client=client,
        embedding=embedding,
        collection_name=collection,
    )

    assert report["status"] == "completed"
    assert report["dataset"]["job_count"] == 60
    assert report["dataset"]["query_count"] == 40
    assert report["index"]["point_count"] == 48
    assert set(report["pipelines"]) == {
        "lexical_overlap",
        "lexical_hard_filters",
        "dense_qwen",
        "dense_qwen_hard_filters",
    }
    assert embedding.document_calls == 48
    assert embedding.query_calls == 81  # warmup plus two dense passes over 40 queries
    assert len(client.indexes) == 13  # every production filterable payload field
    assert len(client.query_filters) == 80
    no_business_filter = client.query_filters[0]
    assert isinstance(no_business_filter, dict)
    assert {item["key"] for item in no_business_filter["must"]} == {
        "is_active",
        "is_deleted",
        "company_is_active",
        "company_is_deleted",
        "index_version",
    }
    hard_filter = client.query_filters[40]
    assert isinstance(hard_filter, dict)
    assert any(item["key"] == "location" for item in hard_filter["must"])
    assert client.deleted == [collection]
    assert not client.collection_exists(collection)
    assert report["cleanup"] == {
        "requested": True,
        "performed": True,
        "verified_deleted": True,
    }


def test_cleanup_runs_when_indexing_fails() -> None:
    client = FakeQdrant()
    collection = f"{TEMP_COLLECTION_PREFIX}{'b' * 32}"
    report = run_live_evaluation(
        LiveEvaluationConfig(),
        qdrant_client=client,
        embedding=FakeEmbedding(fail_document=True),
        collection_name=collection,
    )

    assert report["status"] == "failed"
    assert report["failures"]
    assert client.deleted == [collection]
    assert not client.collection_exists(collection)
    assert report["cleanup"]["performed"] is True
    assert report["cleanup"]["verified_deleted"] is True


def test_keep_collection_is_explicit_and_does_not_delete() -> None:
    client = FakeQdrant()
    collection = f"{TEMP_COLLECTION_PREFIX}{'c' * 32}"
    report = run_live_evaluation(
        LiveEvaluationConfig(keep_collection=True),
        qdrant_client=client,
        embedding=FakeEmbedding(),
        collection_name=collection,
    )

    assert report["status"] == "completed"
    assert client.deleted == []
    assert client.collection_exists(collection)
    assert report["cleanup"]["requested"] is False
    assert report["cleanup"]["performed"] is False
    assert report["cleanup"]["verified_deleted"] is None
    client.delete_collection(collection_name=collection)
