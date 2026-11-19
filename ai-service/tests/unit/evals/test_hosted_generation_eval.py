import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any, NoReturn

import pytest

from talentpulse_ai.core.exceptions import ProviderFailure, ProviderFailureDetails, ServiceError
from talentpulse_ai.scripts.evaluation import hosted_generation_eval as evaluation
from talentpulse_ai.scripts.evaluation.hosted_generation_eval import (
    JOURNEYS,
    _failure_outcome,
    apply_human_reviews,
    evaluate,
    evaluate_application_journeys,
    load_dataset,
    scan_sensitive,
)

DATASET = Path(__file__).resolve().parents[3] / "evals/datasets/generation_quality_eval_v1.json"


def test_dataset_is_synthetic_distinct_and_covers_every_journey() -> None:
    cases = load_dataset(DATASET)
    assert {case["journey"] for case in cases} == set(JOURNEYS)
    assert len({case["id"] for case in cases}) == len(cases)
    assert len({case["prompt"] for case in cases}) == len(cases)
    assert all(not scan_sensitive(case) for case in cases)


@pytest.mark.parametrize(
    "value",
    [
        "person@company.com",
        "AKIAABCDEFGHIJKLMNOP",
        "+84912345678",
        "-----BEGIN PRIVATE KEY-----",
        "Bearer abcdefghijklmnop",
    ],
)
def test_sensitive_data_is_detected(value: str) -> None:
    assert scan_sensitive({"text": value})


def test_failures_are_sanitized_and_coverage_never_claims_acceptance() -> None:
    cases = load_dataset(DATASET)

    def failed(case: dict[str, Any]) -> NoReturn:
        raise RuntimeError("secret person@company.com")

    report = evaluate(cases, {"gemini": failed})
    serialized = json.dumps(report)
    assert "person@company.com" not in serialized
    assert "RuntimeError" not in serialized
    assert not report["release_ready"]
    assert all(row["outcome"] == "provider_failure" for row in report["results"])
    assert all(group["review_required"] == 10 for group in report["groups"])


def test_json_and_contract_failures_are_distinct() -> None:
    case = load_dataset(DATASET)[0]
    invalid_json = evaluate([case], {"bedrock": lambda _: "not JSON"})
    invalid_contract = evaluate([case], {"bedrock": lambda _: {"unexpected": True}})
    assert invalid_json["results"][0]["outcome"] == "json_parse_failure"
    assert invalid_contract["results"][0]["outcome"] == "application_validation_failure"


def test_sensitive_output_is_never_saved() -> None:
    case = load_dataset(DATASET)[0]
    report = evaluate([case], {"gemini": lambda _: {"text": "person@company.com"}})
    assert report["results"][0]["outcome"] == "safety_failure"
    assert "person@company.com" not in json.dumps(report)


def test_provider_schema_rejection_is_distinct_from_other_request_rejection() -> None:
    def rejected(case: dict[str, Any]) -> NoReturn:
        raise ProviderFailure(
            "generation provider failed",
            details=ProviderFailureDetails(
                provider="gemini",
                model="synthetic-model",
                category="invalid_request",
                provider_message="schema_rejected",
            ),
        )

    report = evaluate(load_dataset(DATASET)[:1], {"gemini": rejected})

    assert report["results"][0]["outcome"] == "schema_rejection"


def test_application_validation_failure_is_reported_separately() -> None:
    error = ServiceError("invalid_analysis_output", "Analysis output was rejected.", 502)

    assert _failure_outcome(error) == "application_validation_failure"


def test_dataset_scanned_before_dispatch(tmp_path: Path) -> None:
    path = tmp_path / "unsafe.json"
    path.write_text(json.dumps({"cases": [{"prompt": "person@company.com"}]}))
    with pytest.raises(ValueError, match="unsafe_dataset"):
        load_dataset(path)


def test_cli_rejects_prose_only_dataset_before_provider_initialization(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    cases = [
        {
            "id": f"{journey.lower().replace('_', '-')}-{index}",
            "journey": journey,
            "synthetic": True,
            "prompt": f"Synthetic prose-only {journey}-{index}.",
            "rubric": f"Check grounded claims for {journey}-{index}.",
        }
        for journey in JOURNEYS
        for index in range(30)
    ]
    dataset = tmp_path / "dataset.json"
    output = tmp_path / "report.json"
    dataset.write_text(json.dumps({"synthetic": True, "cases": cases}))
    monkeypatch.setattr(
        sys,
        "argv",
        ["eval", "--provider", "all", "--dataset", str(dataset), "--output", str(output)],
    )
    monkeypatch.setattr(
        evaluation,
        "_live_provider",
        lambda name: pytest.fail("invalid fixtures must block hosted provider setup"),
    )

    assert evaluation.main() == 2
    assert not output.exists()
    assert "details withheld" in capsys.readouterr().out


def test_cli_dispatches_application_journeys_after_fixture_preflight(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cases = [
        {
            "id": f"{journey.lower().replace('_', '-')}-{index}",
            "journey": journey,
            "synthetic": True,
            "prompt": f"Synthetic case {journey}-{index}.",
            "rubric": f"Check grounded claims for {journey}-{index}.",
            "request": {"fixture": "validated-by-test-double"},
        }
        for journey in JOURNEYS
        for index in range(30)
    ]
    dataset = tmp_path / "dataset.json"
    output = tmp_path / "report.json"
    dataset.write_text(json.dumps({"synthetic": True, "cases": cases}))
    monkeypatch.setattr(
        sys,
        "argv",
        ["eval", "--provider", "gemini", "--dataset", str(dataset), "--output", str(output)],
    )
    monkeypatch.setattr(evaluation, "validate_application_dataset", lambda values: None)
    monkeypatch.setattr(evaluation, "_live_provider", lambda name: (object(), "synthetic-model"))
    dispatched: list[tuple[str, int]] = []

    def run_application(
        values: list[dict[str, Any]],
        provider_factory: Callable[[], object],
        *,
        provider_name: str,
    ) -> dict[str, Any]:
        assert provider_factory() is not None
        dispatched.append((provider_name, len(values)))
        return {
            "scope": "application_generation_services",
            "release_ready": False,
            "results": [],
            "groups": [],
            "review_sheet": [],
            "limitations": [],
        }

    monkeypatch.setattr(evaluation, "evaluate_application_journeys", run_application)

    exit_code = evaluation.main()
    assert dispatched == [("gemini", 210)]
    assert exit_code == 0
    report = json.loads(output.read_text())
    assert report["scope"] == "application_generation_services"
    assert report["profiles"] == {"gemini": "synthetic-model"}
    assert report["release_ready"] is False


def test_human_review_requires_ten_complete_reviews_and_ninety_percent_pass_rate() -> None:
    report = {
        "groups": [
            {
                "provider": "gemini",
                "journey": "RAG_ADVICE",
                "review_required": 10,
                "human_threshold": 0.9,
                "human_threshold_met": False,
            }
        ],
        "review_sheet": [
            {
                "provider": "gemini",
                "journey": "RAG_ADVICE",
                "case_id": f"advice-{index}",
                "relevance": index != 0,
                "factual_accuracy": True,
                "usefulness": True,
                "grounding": True,
                "pass": None,
            }
            for index in range(10)
        ],
        "release_ready": False,
    }

    reviewed = apply_human_reviews(report)

    assert reviewed["groups"][0]["reviewed_count"] == 10
    assert reviewed["groups"][0]["human_pass_rate"] == 0.9
    assert reviewed["groups"][0]["human_threshold_met"] is True
    assert reviewed["review_sheet"][0]["pass"] is False
    assert reviewed["review_sheet"][1]["pass"] is True
    assert reviewed["release_ready"] is False


def test_human_review_does_not_count_partial_rating_rows() -> None:
    report = {
        "groups": [
            {
                "provider": "bedrock",
                "journey": "CV_GENERATION",
                "review_required": 10,
                "human_threshold": 0.9,
            }
        ],
        "review_sheet": [
            {
                "provider": "bedrock",
                "journey": "CV_GENERATION",
                "case_id": "cv-generation-1",
                "relevance": True,
                "factual_accuracy": None,
                "usefulness": True,
                "grounding": True,
                "pass": None,
            }
        ],
    }

    reviewed = apply_human_reviews(report)

    assert reviewed["groups"][0]["reviewed_count"] == 0
    assert reviewed["groups"][0]["human_pass_rate"] is None
    assert reviewed["groups"][0]["human_threshold_met"] is False


@pytest.mark.parametrize(("required", "threshold"), [(0, 0.9), (10, float("nan")), (10, 1.1)])
def test_human_review_rejects_invalid_threshold_configuration(
    required: int, threshold: float
) -> None:
    report = {
        "groups": [
            {
                "provider": "gemini",
                "journey": "RAG_ADVICE",
                "review_required": required,
                "human_threshold": threshold,
            }
        ],
        "review_sheet": [],
    }

    with pytest.raises(ValueError, match="invalid_review_report"):
        apply_human_reviews(report)


def test_human_review_rejects_duplicate_case_ratings() -> None:
    report = {
        "groups": [{"provider": "gemini", "journey": "RAG_ADVICE"}],
        "review_sheet": [
            {"provider": "gemini", "journey": "RAG_ADVICE", "case_id": "same"},
            {"provider": "gemini", "journey": "RAG_ADVICE", "case_id": "same"},
        ],
    }

    with pytest.raises(ValueError, match="invalid_review_report"):
        apply_human_reviews(report)


def test_cli_applies_human_reviews_without_repeating_provider_calls(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    reviews = [
        {
            "provider": "gemini",
            "journey": "RAG_ADVICE",
            "case_id": f"advice-{index}",
            "relevance": True,
            "factual_accuracy": True,
            "usefulness": True,
            "grounding": True,
            "pass": None,
        }
        for index in range(10)
    ]
    source = tmp_path / "unreviewed.json"
    output = tmp_path / "reviewed.json"
    source.write_text(
        json.dumps(
            {
                "release_ready": False,
                "groups": [
                    {
                        "provider": "gemini",
                        "journey": "RAG_ADVICE",
                        "review_required": 10,
                        "human_threshold": 0.9,
                        "coverage_met": True,
                        "contract_threshold_met": True,
                    }
                ],
                "review_sheet": reviews,
            }
        )
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "eval",
            "--provider",
            "all",
            "--dataset",
            str(tmp_path / "unused.json"),
            "--output",
            str(output),
            "--reviewed-report",
            str(source),
        ],
    )
    monkeypatch.setattr(
        evaluation,
        "_live_provider",
        lambda name: pytest.fail("review aggregation must not call providers"),
    )

    assert evaluation.main() == 0
    report = json.loads(output.read_text())
    assert report["groups"][0]["human_threshold_met"] is True
    assert report["quality_thresholds_met"] is True
    assert report["release_ready"] is False


def application_case() -> dict[str, Any]:
    return {
        "id": "application-advice",
        "journey": "RAG_ADVICE",
        "synthetic": True,
        "request": {
            "identity": dict.fromkeys(
                (
                    "request_id",
                    "trace_id",
                    "operation_attempt_id",
                    "client_message_id",
                    "user_id",
                    "session_id",
                ),
                "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            ),
            "normalized_user_message": "Suggest a small SQL learning project.",
            "intent": "ADVICE",
            "locale": "en",
            "filter_state": {},
            "explicit_filters": {},
            "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20},
        },
    }


def test_application_advice_executes_real_prompt_validation_and_repair() -> None:
    class Provider:
        model_name = "synthetic"

        def __init__(self) -> None:
            self.prompts: list[str] = []

        def generate(self, prompt: str, **kwargs: object) -> str:
            self.prompts.append(prompt)
            if len(self.prompts) == 1:
                return "invalid JSON"
            return json.dumps(
                {
                    "answer_blocks": [
                        {"kind": "ADVICE", "text": "Build a small SQL inventory project."}
                    ],
                    "claims": [],
                    "citation_keys": [],
                    "referenced_job_ids": [],
                }
            )

    provider = Provider()
    report = evaluate_application_journeys([application_case()], lambda: provider)
    row = report["results"][0]
    assert row["outcome"] == "application_completed"
    assert len(provider.prompts) == 2
    assert "Suggest a small SQL learning project." in provider.prompts[0]
    assert row["response"]["degraded"] is True
    assert report["release_ready"] is False
    assert report["scope"] == "application_generation_services"


def test_application_missing_or_invalid_fixtures_never_construct_provider() -> None:
    def forbidden() -> NoReturn:
        pytest.fail("provider must remain lazy")

    invalid = application_case()
    invalid["request"]["intent"] = "JOB_SEARCH"
    report = evaluate_application_journeys([invalid], forbidden)
    assert all(row["outcome"] == "fixture_blocked" for row in report["results"][:-1])
    assert report["results"][-1]["outcome"] == "fixture_validation_failure"


def test_application_sensitive_fixture_rejected_before_provider() -> None:
    case = application_case()
    case["request"]["normalized_user_message"] = "person@company.com"
    with pytest.raises(ValueError, match="unsafe_dataset"):
        evaluate_application_journeys([case], lambda: pytest.fail("unexpected construction"))


def test_application_search_runs_fallback_instead_of_counting_schema_success() -> None:
    case = application_case()
    case["journey"] = "RAG_JOB_SEARCH"
    case["request"]["intent"] = "JOB_SEARCH"

    class Provider:
        model_name = "synthetic"

        def generate(self, prompt: str, **kwargs: object) -> str:
            return "invalid JSON"

    row = evaluate_application_journeys([case], Provider)["results"][0]
    assert row["outcome"] == "application_completed"
    assert row["response"]["degraded"] is True
    assert row["response"]["referenced_job_ids"] == []


def test_application_comparison_requires_authorized_cv_and_matching_facts() -> None:
    case = application_case()
    case["journey"] = "RAG_CV_JOB_COMPARISON"
    case["request"]["intent"] = "CV_JOB_COMPARISON"
    row = evaluate_application_journeys(
        [case], lambda: pytest.fail("must validate consent fixture before construction")
    )["results"][0]
    assert row["outcome"] == "fixture_validation_failure"


def test_application_unknown_journeys_are_explicitly_blocked() -> None:
    cases = []
    for journey in ("UNKNOWN",):
        case = application_case()
        case["journey"] = journey
        cases.append(case)
    report = evaluate_application_journeys(cases, lambda: pytest.fail("must remain lazy"))
    assert all(row["outcome"] == "journey_not_implemented" for row in report["results"])


def test_application_provider_exception_body_is_not_reported() -> None:
    def failed() -> NoReturn:
        raise RuntimeError("person@company.com")

    report = evaluate_application_journeys([application_case()], failed)
    assert report["results"][0]["outcome"] == "provider_failure"
    assert "person@company.com" not in json.dumps(report)
