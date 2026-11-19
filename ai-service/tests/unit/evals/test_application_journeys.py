"""Explicit isolated synthetic service contracts, never canonical production records."""

from typing import Any

import pytest

from talentpulse_ai.scripts.evaluation.hosted_generation_eval import (
    evaluate_application_journeys,
    validate_application_dataset,
)

# Stable IDs belong only to this synthetic universe; no lookup or authorization is implied.
IDENTITY = {
    key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    for key in ("request_id", "trace_id", "operation_attempt_id")
}
JOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
CV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"


class ScriptedProvider:
    model_name = "synthetic"

    def __init__(self, *outputs: dict[str, Any]) -> None:
        self.outputs = list(outputs)
        self.prompts: list[str] = []

    def generate(self, prompt: str) -> str:
        raise AssertionError("structured boundary expected")

    def generate_structured(
        self,
        prompt: str,
        schema: object,
        timeout: float | None = None,
        *,
        num_predict: int | None = None,
    ) -> dict[str, Any]:
        self.prompts.append(prompt)
        assert timeout is not None and timeout > 0
        assert self.outputs, "unexpected provider call"
        return self.outputs.pop(0)


def rag_case(journey: str) -> dict[str, Any]:
    request: dict[str, Any] = {
        "identity": {
            **IDENTITY,
            **dict.fromkeys(("client_message_id", "user_id", "session_id"), CV),
        },
        "normalized_user_message": "Explain this synthetic Python role using supplied facts.",
        "intent": "JOB_SEARCH",
        "locale": "en",
        "filter_state": {},
        "explicit_filters": {},
        "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20},
        "canonical_active_job_context": [
            {
                "job_id": JOB,
                "title": "Python Engineer",
                "company_name": "Synthetic Lab",
                "skills": ["Python", "SQL"],
            }
        ],
        "retrieval_evidence": [
            {"job_id": JOB, "rank": 1, "score": 0.8, "citation_key": "job:synthetic"}
        ],
    }
    if journey == "RAG_CV_JOB_COMPARISON":
        request.update(
            {
                "intent": "CV_JOB_COMPARISON",
                "consent_version": "synthetic-consent-v1",
                "authorized_cv_snapshot": {
                    "cv_id": CV,
                    "content_hash": "a" * 64,
                    "skills": ["Python"],
                    "sanitized_text": "Synthetic coursework records Python.",
                    "consent_version": "synthetic-consent-v1",
                },
                "matching_evidence": {
                    "cv_id": CV,
                    "job_id": JOB,
                    "overall_score": 0.6,
                    "components": {},
                    "matched_skills": ["Python"],
                    "missing_required_skills": ["SQL"],
                    "explanation": "Recorded Python; SQL evidence missing.",
                    "degraded": False,
                    "scoring_version": "synthetic-v1",
                    "semantic_component_version": "unavailable-v1",
                },
            }
        )
    elif journey == "RAG_ADVICE":
        request["intent"] = "ADVICE"
        request["canonical_active_job_context"] = []
        request["retrieval_evidence"] = []
    return {
        "id": journey.lower().replace("_", "-"),
        "journey": journey,
        "synthetic": True,
        "rubric": "Ground every factual claim in the supplied synthetic context.",
        "request": request,
    }


def test_successful_search_preserves_canonical_citations() -> None:
    provider = ScriptedProvider(
        {
            "answer_blocks": [{"kind": "INFERENCE", "text": "Consider the Python Engineer role."}],
            "selected_job_ids": [JOB],
        },
        {"all_assertions_supported": True},
    )
    row = evaluate_application_journeys([rag_case("RAG_JOB_SEARCH")], lambda: provider)["results"][
        0
    ]
    assert row["outcome"] == "application_completed"
    assert row["response"]["source"] == "llm"
    assert row["response"]["degraded"] is False
    assert row["response"]["referenced_job_ids"] == [JOB]
    assert row["response"]["citation_keys"] == ["job:synthetic"]
    assert row["first_pass_contract_valid"] is True
    assert len(provider.prompts) == 2
    assert not provider.outputs


def test_successful_comparison_preserves_deterministic_facts() -> None:
    provider = ScriptedProvider(
        {"explanation": "Python is recorded in the CV; SQL needs verification."},
        dict.fromkeys(
            (
                "score_consistent",
                "skill_assertions_consistent",
                "job_facts_supported",
                "other_assertions_supported",
            ),
            True,
        ),
    )
    row = evaluate_application_journeys([rag_case("RAG_CV_JOB_COMPARISON")], lambda: provider)[
        "results"
    ][0]
    assert row["outcome"] == "application_completed"
    assert row["response"]["degraded"] is False
    assert row["response"]["referenced_job_ids"] == [JOB]
    assert len(provider.prompts) == 2
    assert not provider.outputs


def test_successful_match_analysis_uses_derived_facts() -> None:
    unknown = {"score": None, "weight": 0.0, "available": False}
    case = {
        "id": "analysis",
        "journey": "CV_MATCH_ANALYSIS",
        "synthetic": True,
        "request": {
            "identity": IDENTITY,
            "analysis_version_key": "a" * 64,
            "locale": "en",
            "narrative_version": "match-narrative-v1",
            "facts": {
                "overall_score": 0.6,
                "components": {
                    "semantic": unknown,
                    "experience": unknown,
                    "skills": {"score": 0.6, "weight": 1.0, "available": True},
                },
                "compatibility": {"location": unknown, "work_mode": unknown},
                "matched_skill_refs": ["m0"],
                "missing_required_skill_refs": ["g0"],
                "matched_skill_total": 1,
                "missing_required_skill_total": 1,
                "degraded": False,
                "skill_context": [{"ref": "m0", "label": "Python"}, {"ref": "g0", "label": "SQL"}],
            },
        },
    }
    provider = ScriptedProvider(
        {
            "summary": {
                "text": "Recorded coverage needs verification; experience is unknown.",
                "evidence": ["overall", "skills"],
            },
            "strengths": [
                {"text": "Python is recorded, not verified proficiency.", "evidence": ["m0"]}
            ],
            "points_to_verify": [{"text": "Ask about SQL practice.", "evidence": ["g0"]}],
        }
    )
    row = evaluate_application_journeys([case], lambda: provider)["results"][0]
    assert row["outcome"] == "application_completed"
    assert row["response"]["source"] == "llm"
    assert row["response"]["strengths"][0]["evidence"] == ["m0"]
    assert len(provider.prompts) == 1


def cv_case(journey: str) -> dict[str, Any]:
    return {
        "id": journey.lower().replace("_", "-"),
        "journey": journey,
        "synthetic": True,
        "request": {
            "identity": IDENTITY,
            "candidate": {
                "candidate_id": CV,
                "full_name": "Synthetic Candidate",
                "skills": ["Python"],
                "projects": [
                    {
                        "project_name": "Inventory",
                        "technologies": ["Python"],
                        "description": "Xây dựng công cụ kiểm kê bằng Python."
                        if journey == "CV_LOCALIZATION"
                        else "Built an inventory tool with Python.",
                    }
                ],
            },
            "job": {
                "job_id": JOB,
                "title": "Python Engineer",
                "company_name": "Synthetic Lab",
                "required_skills": ["Python"],
            },
            "template_type": "template1",
            "locale": "en",
            "source_version": "synthetic-v1",
            "content_version": 1,
        },
    }


@pytest.mark.parametrize("journey", ["CV_GENERATION", "CV_LOCALIZATION"])
def test_cv_journeys_run_real_core_localization_and_draft_validation(journey: str) -> None:
    class CvProvider(ScriptedProvider):
        def generate_structured(
            self,
            prompt: str,
            schema: Any,
            timeout: float | None = None,
            *,
            num_predict: int | None = None,
        ) -> dict[str, Any]:
            self.prompts.append(prompt)
            assert timeout is not None and timeout > 0
            if "items" in schema.get("properties", {}):
                import json

                data = json.loads(
                    prompt.split("<untrusted_data>\n", 1)[1].split("\n</untrusted_data>", 1)[0]
                )
                return {
                    "items": [
                        {"key": item["key"], "text": "Built an inventory tool with Python."}
                        for item in data["items"]
                    ]
                }
            return {
                "bullets": [],
                "project_bullets": [
                    {"source_index": 0, "text": "Built an inventory tool with Python."}
                ],
            }

    provider = CvProvider()
    row = evaluate_application_journeys([cv_case(journey)], lambda: provider)["results"][0]
    assert row["outcome"] == "application_completed"
    assert row["response"]["generation_mode"] == "EDITOR_ONLY"
    assert row["response"]["projects"][0]["source_index"] == 0
    assert row["response"]["projects"][0]["description"] == "Built an inventory tool with Python."
    assert provider.prompts
    if journey == "CV_LOCALIZATION":
        assert any("<untrusted_data>" in prompt for prompt in provider.prompts)


def test_career_agent_executes_bounded_runtime_and_finalization() -> None:
    case = rag_case("CAREER_CHAT_AGENT")
    case["request"]["intent"] = "ADVICE"
    case["request"]["canonical_active_job_context"] = []
    case["request"]["retrieval_evidence"] = []
    provider = ScriptedProvider(
        {
            "kind": "final",
            "output": {
                "answer_blocks": [
                    {"kind": "ADVICE", "text": "Build a small Python inventory project."}
                ],
                "claims": [],
                "citation_keys": [],
                "referenced_job_ids": [],
            },
        }
    )
    row = evaluate_application_journeys([case], lambda: provider)["results"][0]
    assert row["outcome"] == "application_completed"
    assert row["response"]["degraded"] is False
    assert len(provider.prompts) == 1


def test_career_agent_reads_prepared_context_through_real_tool_dispatch() -> None:
    case = rag_case("CAREER_CHAT_AGENT")
    provider = ScriptedProvider(
        {
            "kind": "tool_call",
            "tool_call_id": "synthetic-context",
            "tool_id": "rag.retrieve_context",
            "input": {},
        },
        {
            "kind": "final",
            "output": {
                "answer_blocks": [
                    {"kind": "INFERENCE", "text": "Consider the Python Engineer role."}
                ],
                "claims": [
                    {
                        "claim_id": "title",
                        "type": "JOB_TITLE",
                        "subject_id": JOB,
                        "value": "Python Engineer",
                        "citation_keys": ["job:synthetic"],
                    }
                ],
                "citation_keys": ["job:synthetic"],
                "referenced_job_ids": [JOB],
            },
        },
    )
    row = evaluate_application_journeys([case], lambda: provider)["results"][0]
    assert row["outcome"] == "application_completed"
    assert row["response"]["degraded"] is False
    assert row["response"]["referenced_job_ids"] == [JOB]
    assert len(provider.prompts) == 2
    assert "Synthetic Lab" in provider.prompts[1]
    assert not provider.outputs


@pytest.mark.parametrize(
    "field", ["authorized_cv_snapshot", "consent_version", "matching_evidence"]
)
def test_comparison_missing_contract_input_blocks_before_provider(field: str) -> None:
    case = rag_case("RAG_CV_JOB_COMPARISON")
    del case["request"][field]
    row = evaluate_application_journeys(
        [case], lambda: pytest.fail("invalid fixture must not construct provider")
    )["results"][0]
    assert row["outcome"] == "fixture_validation_failure"


def test_canonical_context_does_not_accept_prose_placeholder_ids() -> None:
    case = rag_case("RAG_JOB_SEARCH")
    case["request"]["canonical_active_job_context"][0]["job_id"] = "j1"
    row = evaluate_application_journeys(
        [case], lambda: pytest.fail("placeholder IDs must not be promoted")
    )["results"][0]
    assert row["outcome"] == "fixture_validation_failure"


def test_comparison_mismatched_consent_is_not_repaired_by_runner() -> None:
    case = rag_case("RAG_CV_JOB_COMPARISON")
    case["request"]["authorized_cv_snapshot"]["consent_version"] = "different-synthetic-consent"
    row = evaluate_application_journeys(
        [case], lambda: pytest.fail("consent mismatch must block before provider")
    )["results"][0]
    assert row["outcome"] == "fixture_validation_failure"


def test_search_rejected_grounding_is_fallback_not_provider_success() -> None:
    selection = {
        "answer_blocks": [{"kind": "INFERENCE", "text": "Consider the Python Engineer role."}],
        "selected_job_ids": [JOB],
    }
    provider = ScriptedProvider(
        selection,
        {"all_assertions_supported": False},
        selection,
        {"all_assertions_supported": False},
    )
    row = evaluate_application_journeys([rag_case("RAG_JOB_SEARCH")], lambda: provider)["results"][
        0
    ]
    assert row["outcome"] == "application_completed"
    assert row["response"]["source"] == "deterministic_fallback"
    assert row["response"]["degraded"] is True
    assert row["first_pass_contract_valid"] is False
    assert len(provider.prompts) == 4
    assert not provider.outputs


def test_application_report_contains_per_journey_metrics_and_review_sheet() -> None:
    provider = ScriptedProvider(
        {
            "answer_blocks": [{"kind": "ADVICE", "text": "Build a small SQL inventory project."}],
            "claims": [],
            "citation_keys": [],
            "referenced_job_ids": [],
        }
    )
    case = rag_case("RAG_ADVICE")
    report = evaluate_application_journeys([case], lambda: provider, provider_name="gemini")

    row = report["results"][0]
    group = next(group for group in report["groups"] if group["journey"] == "RAG_ADVICE")
    review = report["review_sheet"][0]
    assert row["provider"] == "gemini"
    assert row["first_pass_contract_valid"] is True
    assert group["first_pass_contract_rate"] == 1
    assert group["contract_threshold_met"] is False
    assert group["coverage_met"] is False
    assert group["review_available"] == 1
    assert review["response"] == row["response"]
    assert review["rubric"] == case["rubric"]
    assert review["pass"] is None


def test_application_report_requires_thirty_cases_for_contract_threshold() -> None:
    cases = [rag_case("RAG_ADVICE") for _ in range(30)]
    for index, case in enumerate(cases):
        case["id"] = f"advice-{index}"
    provider = ScriptedProvider(
        *[
            {
                "answer_blocks": [
                    {"kind": "ADVICE", "text": f"Build a synthetic project number {index}."}
                ],
                "claims": [],
                "citation_keys": [],
                "referenced_job_ids": [],
            }
            for index in range(30)
        ]
    )

    report = evaluate_application_journeys(cases, lambda: provider, provider_name="bedrock")
    group = next(group for group in report["groups"] if group["journey"] == "RAG_ADVICE")

    assert group["cases"] == 30
    assert group["coverage_met"] is True
    assert group["first_pass_contract_rate"] == 1
    assert group["contract_threshold_met"] is True
    assert group["review_available"] == 10
    assert len(report["review_sheet"]) == 30


def test_application_preflight_rejects_prose_seed_before_provider_calls() -> None:
    prose_case = rag_case("RAG_ADVICE")
    prose_case.pop("request")

    with pytest.raises(ValueError, match="application_dataset_incomplete"):
        validate_application_dataset([prose_case], minimum_cases_per_journey=0)


@pytest.mark.parametrize("journey", ["CV_GENERATION", "CV_LOCALIZATION"])
def test_cv_journeys_require_explicit_candidate_and_job(journey: str) -> None:
    case = cv_case(journey)
    del case["request"]["candidate"]["candidate_id"]
    row = evaluate_application_journeys(
        [case], lambda: pytest.fail("missing candidate ID must not be invented")
    )["results"][0]
    assert row["outcome"] == "fixture_validation_failure"
