from __future__ import annotations

import json
from dataclasses import replace

import pytest
from app.adapters.qdrant import representation_manifest_digest
from app.core.index_representation import (
    CHUNKING_VERSION,
    INDEX_SCHEMA_VERSION,
    NORMALIZATION_VERSION,
    RepresentationManifest,
)
from app.schemas import IndexJobDeleteRequest

from .local_retrieval import (
    REQUIRED_SCENARIOS,
    build_local_index,
    canonical_eligible_job_ids,
    load_gold_fixture,
    make_upsert_request,
    reconcile_local_index,
    run_local_evaluation,
)


def test_gold_fixture_covers_required_synthetic_scenarios() -> None:
    fixture = load_gold_fixture()

    assert REQUIRED_SCENARIOS <= {query.name for query in fixture.queries}
    assert len(fixture.jobs) >= 10
    assert len({job.job_id for job in fixture.jobs}) == len(fixture.jobs)
    assert all("@" not in job.job.company_name for job in fixture.jobs)
    assert all(
        "example.test" in job.job.description for job in fixture.jobs if "@" in job.job.description
    )


@pytest.mark.asyncio
async def test_local_evaluation_enforces_phase_two_release_gates() -> None:
    evaluation = await run_local_evaluation()
    report = evaluation.report

    print(json.dumps(report.as_dict(), ensure_ascii=False, sort_keys=True))

    assert report.filter_correctness == 1.0
    assert report.lifecycle_leakage == 0
    assert report.duplicate_job_cards == 0
    assert report.payload_safety_violations == 0
    assert report.no_result_failures == 0
    assert report.consistency_missing == 0
    assert report.consistency_orphan == 0
    assert report.consistency_stale == 0
    assert report.injection_safety_violations == 0
    assert 0.0 <= report.recall_at_10 <= 1.0
    assert report.release_gate_failures == ()
    assert report.passed is True
    assert report.as_dict()["release_gate_failures"] == []
    assert report.as_dict()["passed"] is True


@pytest.mark.asyncio
async def test_local_evaluation_reports_representation_identity_and_stable_digest() -> None:
    evaluation = await run_local_evaluation()
    report = evaluation.report

    manifest = report.representation
    assert isinstance(manifest, RepresentationManifest)
    assert manifest.as_dict() == {
        "provider": "fake",
        "model": "fake-embedding",
        "dimensions": 4,
        "normalization_version": NORMALIZATION_VERSION,
        "chunking_version": CHUNKING_VERSION,
        "index_schema_version": INDEX_SCHEMA_VERSION,
        "physical_collection": "jobs_fake_local_v1",
        "alias": "jobs_fake_local_v1",
        "collection_version": "local-eval-v1",
        "embedding_provider": "fake",
        "embedding_model_version": "fake-embedding",
        "embedding_dimensions": 4,
    }
    assert report.manifest_digest == representation_manifest_digest(manifest)
    assert report.as_dict()["representation"] == manifest.as_dict()
    assert report.as_dict()["manifest_digest"] == report.manifest_digest


@pytest.mark.asyncio
async def test_release_gate_fails_when_recall_is_below_explicit_target() -> None:
    evaluation = await run_local_evaluation()
    failed_report = replace(evaluation.report, recall_at_10=0.84)

    assert failed_report.release_gate_failures == ("recall_at_10",)
    assert failed_report.passed is False
    assert failed_report.as_dict()["recall_at_10_target"] == 0.85
    assert failed_report.as_dict()["passed"] is False


@pytest.mark.asyncio
async def test_release_gate_fails_for_empty_query_count() -> None:
    evaluation = await run_local_evaluation()
    empty_report = replace(evaluation.report, query_count=0)

    assert "query_count" in empty_report.release_gate_failures
    assert empty_report.passed is False


@pytest.mark.asyncio
async def test_release_gate_accepts_recall_at_exact_target() -> None:
    evaluation = await run_local_evaluation()
    target_report = replace(evaluation.report, recall_at_10=0.85)

    assert "recall_at_10" not in target_report.release_gate_failures
    assert target_report.passed is True


@pytest.mark.asyncio
async def test_release_gate_rejects_recall_above_one() -> None:
    evaluation = await run_local_evaluation()
    invalid_report = replace(evaluation.report, recall_at_10=1.01)

    assert "recall_at_10" in invalid_report.release_gate_failures
    assert invalid_report.passed is False


@pytest.mark.asyncio
async def test_release_gate_fails_for_no_result_failure() -> None:
    evaluation = await run_local_evaluation()
    failed_report = replace(evaluation.report, no_result_failures=1)

    assert "no_result" in failed_report.release_gate_failures
    assert failed_report.passed is False


@pytest.mark.asyncio
async def test_release_gate_includes_each_existing_quality_field() -> None:
    evaluation = await run_local_evaluation()
    cases = (
        ("filter_correctness", 0.0, "filter_correctness"),
        ("lifecycle_leakage", 1, "lifecycle_leakage"),
        ("duplicate_job_cards", 1, "duplicate_job_cards"),
        ("payload_safety_violations", 1, "payload_safety"),
        ("injection_safety_violations", 1, "injection_safety"),
        ("no_result_failures", 1, "no_result"),
        ("consistency_missing", 1, "consistency"),
        ("consistency_orphan", 1, "consistency"),
        ("consistency_stale", 1, "consistency"),
    )

    for field_name, value, failure_name in cases:
        failed_report = replace(evaluation.report, **{field_name: value})
        assert failure_name in failed_report.release_gate_failures
        assert failed_report.passed is False


@pytest.mark.asyncio
async def test_canonical_eligible_set_matches_fake_index_after_backfill() -> None:
    fixture = load_gold_fixture()
    index = await build_local_index(fixture)
    consistency = reconcile_local_index(index)

    assert consistency.missing_job_ids == ()
    assert consistency.orphan_job_ids == ()
    assert consistency.stale_job_ids == ()
    assert set(index.indexed_job_ids) == canonical_eligible_job_ids(fixture)
    assert set(index.rejected_job_ids) == {
        job.job_id for job in fixture.jobs if not job.expected_eligible
    }


@pytest.mark.asyncio
async def test_chunk_retrieval_collapses_to_one_logical_job_card() -> None:
    evaluation = await run_local_evaluation()
    long_job = next(job for job in evaluation.fixture.jobs if job.name == "long-chunked-job")
    result = evaluation.results["adjacent-platform-role"]

    records = await evaluation.store.get_by_job_id(long_job.job_id)

    assert len(records) > 1
    assert len(result.job_ids) == len(set(result.job_ids))
    assert long_job.job_id in result.job_ids
    assert evaluation.report.raw_chunk_duplicate_matches > 0
    assert evaluation.report.duplicate_job_cards == 0


@pytest.mark.asyncio
async def test_payload_and_evaluation_output_never_expose_raw_sensitive_fields() -> None:
    evaluation = await run_local_evaluation()

    for record in evaluation.store.records.values():
        payload_text = json.dumps(record.payload, ensure_ascii=False).casefold()
        assert "description" not in record.payload
        assert "candidate@example.test" not in payload_text
        assert "ignore previous instructions" not in payload_text

    report_text = json.dumps(evaluation.report.as_dict(), ensure_ascii=False).casefold()
    for forbidden in (
        "description",
        "cv",
        "resume",
        "prompt",
        "response",
        "vector",
        "api_key",
        "secret",
        "candidate@example.test",
        "ignore previous instructions",
    ):
        assert forbidden not in report_text


@pytest.mark.asyncio
async def test_stale_delete_and_chunk_transitions_leave_no_old_points() -> None:
    fixture = load_gold_fixture()
    index = await build_local_index(fixture)
    long_job = next(job for job in fixture.jobs if job.name == "long-chunked-job")
    long_response = index.responses[long_job.job_id]

    shortened_job = long_job.job.model_copy(
        update={"description": "Operate a Python platform with deterministic controls."}
    )
    transitioned = await index.indexer.upsert(
        make_upsert_request(shortened_job, source_version=2, idempotency_key="long-v2")
    )
    assert set(long_response.point_ids) <= set(transitioned.deleted_point_ids)
    assert len(await index.store.get_by_job_id(long_job.job_id)) == 1

    stale = await index.indexer.upsert(
        make_upsert_request(long_job.job, source_version=1, idempotency_key="long-stale-v1")
    )
    assert stale.status == "STALE_IGNORED"
    assert len(await index.store.get_by_job_id(long_job.job_id)) == 1

    deleted_job = next(job for job in fixture.jobs if job.name == "exact-backend-job")
    deleted = await index.indexer.delete(
        IndexJobDeleteRequest(
            job_id=deleted_job.job.job_id,
            idempotency_key="backend-delete-v2",
            source_version=2,
        )
    )
    repeated = await index.indexer.delete(
        IndexJobDeleteRequest(
            job_id=deleted_job.job.job_id,
            idempotency_key="backend-delete-replay-v2",
            source_version=2,
        )
    )
    stale_upsert = await index.indexer.upsert(
        make_upsert_request(deleted_job.job, source_version=1, idempotency_key="backend-stale-v1")
    )

    assert deleted.status == "DELETED"
    assert repeated.status == "ALREADY_DELETED"
    assert stale_upsert.status == "STALE_IGNORED"
    assert await index.store.get_by_job_id(deleted_job.job_id) == []
