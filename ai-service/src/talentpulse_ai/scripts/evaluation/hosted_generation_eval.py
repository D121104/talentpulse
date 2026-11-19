"""Opt-in evaluation of synthetic inputs through application generation services."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from collections.abc import Callable, Mapping
from math import isfinite
from pathlib import Path
from typing import Any, cast

from pydantic import BaseModel, TypeAdapter, ValidationError

from talentpulse_ai.agent_foundation.contracts import ModelDecision
from talentpulse_ai.modules.cv_analysis.schemas import MatchNarrative
from talentpulse_ai.modules.cv_generator.schemas import CvDraft, ProviderLocalizedItems
from talentpulse_ai.modules.rag_chatbot.schemas import ProviderGeneration

JOURNEYS = (
    "RAG_JOB_SEARCH",
    "RAG_ADVICE",
    "RAG_CV_JOB_COMPARISON",
    "CAREER_CHAT_AGENT",
    "CV_MATCH_ANALYSIS",
    "CV_GENERATION",
    "CV_LOCALIZATION",
)
_SENSITIVE = re.compile(
    r"[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|"
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+|"
    r"(?<![\w-])\+?\d{10,15}(?![\w-])|"
    r"\b(?:api[_-]?key|password|secret)\s*[:=]\s*\S+",
    re.IGNORECASE,
)


def scan_sensitive(value: object) -> bool:
    """Conservative tripwire, not a substitute for approved synthetic provenance."""
    return bool(_SENSITIVE.search(json.dumps(value, ensure_ascii=False)))


def load_dataset(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if scan_sensitive(data):
        raise ValueError("unsafe_dataset")
    cases = data.get("cases")
    if data.get("synthetic") is not True or not isinstance(cases, list) or not cases:
        raise ValueError("invalid_dataset")
    ids: set[str] = set()
    for case in cases:
        if (
            not isinstance(case, dict)
            or case.get("journey") not in JOURNEYS
            or not all(
                isinstance(case.get(k), str) and case[k].strip() for k in ("id", "prompt", "rubric")
            )
            or not re.fullmatch(r"[a-z0-9-]{1,64}", case["id"])
            or case["id"] in ids
        ):
            raise ValueError("invalid_dataset")
        ids.add(case["id"])
    return cases


def _contract(journey: str) -> TypeAdapter[Any]:
    models: dict[str, Any] = {
        "CAREER_CHAT_AGENT": ModelDecision,
        "CV_MATCH_ANALYSIS": MatchNarrative,
        "CV_GENERATION": CvDraft,
        "CV_LOCALIZATION": ProviderLocalizedItems,
    }
    return TypeAdapter(models.get(journey, ProviderGeneration))


def _safety(case: dict[str, Any], value: dict[str, Any]) -> bool:
    if case["journey"].startswith("RAG_"):
        return bool(value.get("answer_blocks"))
    if case["journey"] == "CV_GENERATION":
        return value.get("generation_mode") == "EDITOR_ONLY" and not any(
            value.get(key) for key in ("email", "phone", "address", "link")
        )
    if case["journey"] == "CAREER_CHAT_AGENT":
        # The seed fixtures explicitly allow no tools.
        return value.get("kind") == "final" and bool(value.get("output"))
    if case["journey"] == "CV_MATCH_ANALYSIS":
        supplied = set(re.findall(r"\b[mg]\d+\b", case["prompt"]))
        for field in ("summary", "strengths", "points_to_verify"):
            statements = [value[field]] if field == "summary" else value[field]
            for statement in statements:
                for ref in statement["evidence"]:
                    if re.fullmatch(r"[mg]\d+", ref) and ref not in supplied:
                        return False
    if case["journey"] == "CV_LOCALIZATION":
        expected = re.findall(r"\b([a-z_]+) =", case["prompt"])
        keys = [item["key"] for item in value["items"]]
        return sorted(keys) == sorted(expected)
    return True


def _failure_outcome(error: Exception) -> str:
    service_code = getattr(error, "code", None)
    if service_code == "invalid_analysis_output":
        return "application_validation_failure"
    if service_code in {"analysis_provider_failed", "analysis_provider_unavailable"}:
        return "provider_failure"
    details = getattr(error, "details", None)
    category = getattr(details, "category", None)
    safe_message = getattr(details, "provider_message", None)
    if category == "invalid_request" and safe_message in {
        "schema_rejected",
        "response_schema_rejected",
        "response_json_schema_rejected",
    }:
        return "schema_rejection"
    return {
        "schema_rejected": "schema_rejection",
        "blocked": "blocked_response",
        "incomplete": "incomplete_response",
        "invalid_json": "json_parse_failure",
        "provider_rejected": "provider_rejection",
        "invalid_request": "request_rejection",
        "invalid_response": "invalid_provider_response",
        "invalid_output": "invalid_provider_output",
        "consent_denied": "consent_denial",
    }.get(str(category), "provider_failure")


def evaluate(
    cases: list[dict[str, Any]],
    providers: Mapping[str, Callable[[dict[str, Any]], object]],
) -> dict[str, Any]:
    if scan_sensitive(cases):
        raise ValueError("unsafe_dataset")
    results: list[dict[str, Any]] = []
    sheets: list[dict[str, Any]] = []
    groups: list[dict[str, Any]] = []
    for provider, dispatch in providers.items():
        for case in cases:
            outcome = "provider_failure"
            response: object = None
            try:
                raw = dispatch(case)
                if scan_sensitive(raw):
                    outcome = "safety_failure"
                else:
                    try:
                        parsed = json.loads(raw) if isinstance(raw, str) else raw
                    except (ValueError, TypeError):
                        outcome = "json_parse_failure"
                    else:
                        try:
                            response = _contract(case["journey"]).validate_python(parsed)
                        except ValidationError:
                            outcome = "application_validation_failure"
                        else:
                            response = _contract(case["journey"]).dump_python(response, mode="json")
                            outcome = (
                                "contract_valid"
                                if _safety(case, cast(dict[str, Any], response))
                                else "safety_failure"
                            )
            except Exception as exc:
                # Never persist exception messages, provider bodies, prompts or tracebacks.
                outcome = _failure_outcome(exc)
            row = {
                "provider": provider,
                "case_id": case["id"],
                "journey": case["journey"],
                "outcome": outcome,
            }
            results.append(row)
            if outcome == "contract_valid":
                row["review_id"] = f"review-{len(sheets) + 1}"
                sheets.append(
                    {
                        "review_id": row["review_id"],
                        "case_id": case["id"],
                        "journey": case["journey"],
                        "response": response,
                        "rubric": case["rubric"],
                        "synthetic_context": case["prompt"],
                        "relevance": None,
                        "factual_accuracy": None,
                        "usefulness": None,
                        "grounding": None,
                        "pass": None,
                    }
                )
        for journey in JOURNEYS:
            rows = [r for r in results if r["provider"] == provider and r["journey"] == journey]
            valid = sum(r["outcome"] == "contract_valid" for r in rows)
            groups.append(
                {
                    "provider": provider,
                    "journey": journey,
                    "cases": len(rows),
                    "first_pass_contract_rate": valid / len(rows) if rows else 0,
                    "coverage_met": len(rows) >= 30,
                    "contract_threshold_met": bool(rows) and valid / len(rows) >= 0.95,
                    "review_required": 10,
                    "review_available": min(valid, 10),
                    "human_threshold": 0.9,
                    "human_threshold_met": False,
                    "outcomes": dict(Counter(r["outcome"] for r in rows)),
                }
            )
    return {
        "scope": "provider_schema_probe",
        "release_ready": False,
        "limitations": [
            "Seed coverage below 30 per journey; no acceptance claim.",
            "Does not execute application prompts, retries, consent, grounding "
            "or citation validators.",
            "Automated safety checks are partial; semantic quality requires human review.",
            "No consent denial is simulated or counted as first-pass generation success.",
        ],
        "results": results,
        "groups": groups,
        "review_sheet": sheets,
        "review_instructions": "Blind-score all four dimensions; at least ten per journey/profile. "
        "All applicable dimensions must pass. "
        "Provider key is in results only.",
    }


def evaluate_application_journeys(
    cases: list[dict[str, Any]],
    provider_factory: Callable[[], object],
    *,
    provider_name: str = "scripted",
) -> dict[str, Any]:
    """Run explicit synthetic service requests, without constructing application dependencies.

    Prose probe fixtures cannot safely be promoted to canonical/authorized application data.
    A caller must supply the actual request and an explicitly approved provider boundary.
    """
    from talentpulse_ai.agent_foundation.model import AgentModelAdapter
    from talentpulse_ai.modules.cv_analysis.analysis import MatchAnalysisService
    from talentpulse_ai.modules.cv_analysis.schemas import MatchAnalysisRequest
    from talentpulse_ai.modules.cv_generator.schemas import CvDraftRequest
    from talentpulse_ai.modules.cv_generator.service import CvDraftGenerationService
    from talentpulse_ai.modules.rag_chatbot.agent import CareerChatAgent
    from talentpulse_ai.modules.rag_chatbot.generation.generator import GenerationService
    from talentpulse_ai.modules.rag_chatbot.schemas import GenerationProvider, RagGenerateRequest

    if scan_sensitive(cases):
        raise ValueError("unsafe_dataset")
    provider: object | None = None
    results: list[dict[str, Any]] = []
    review_sheet: list[dict[str, Any]] = []
    for case in cases:
        row = {
            "provider": provider_name,
            "case_id": case["id"],
            "journey": case["journey"],
        }
        results.append(row)
        if case.get("synthetic") is not True or not isinstance(case.get("request"), dict):
            row["outcome"] = "fixture_blocked"
            continue
        if case.get("journey") not in JOURNEYS:
            row["outcome"] = "journey_not_implemented"
            continue
        try:
            request = _validated_application_request(case)
        except (KeyError, TypeError, ValidationError, ValueError):
            row["outcome"] = "fixture_validation_failure"
            continue
        journey = case["journey"]
        draft_service: CvDraftGenerationService | None = None
        try:
            if provider is None:
                provider = provider_factory()
            if journey.startswith("RAG_"):
                response = GenerationService(cast(GenerationProvider, provider)).generate(
                    cast(RagGenerateRequest, request)
                )
                value = response.model_dump(mode="json")
            elif journey == "CAREER_CHAT_AGENT":
                value = (
                    CareerChatAgent(AgentModelAdapter(cast(GenerationProvider, provider)))
                    .generate(cast(RagGenerateRequest, request))
                    .model_dump(mode="json")
                )
            elif journey == "CV_MATCH_ANALYSIS":
                value = (
                    MatchAnalysisService(provider)
                    .analyze(cast(MatchAnalysisRequest, request))
                    .model_dump(mode="json")
                )
            else:
                # Localization is an application-owned stage of draft generation, not
                # a public endpoint accepting arbitrary provider localization keys.
                draft_service = CvDraftGenerationService(cast(GenerationProvider, provider))
                value = draft_service.generate(cast(CvDraftRequest, request)).model_dump(
                    mode="json"
                )
            if scan_sensitive(value):
                row["outcome"] = "safety_failure"
                continue
            first_pass = _first_pass_contract_valid(
                journey,
                value,
                draft_service.last_metrics if draft_service is not None else None,
            )
            row["outcome"] = "application_completed"
            row["first_pass_contract_valid"] = first_pass
            row["response"] = value
            review_id = f"review-{len(review_sheet) + 1}"
            row["review_id"] = review_id
            review_sheet.append(
                {
                    "provider": provider_name,
                    "review_id": review_id,
                    "case_id": case["id"],
                    "journey": journey,
                    "response": value,
                    "rubric": case.get("rubric", ""),
                    "synthetic_context": case["request"],
                    "relevance": None,
                    "factual_accuracy": None,
                    "usefulness": None,
                    "grounding": None,
                    "pass": None,
                }
            )
        except Exception as exc:
            row["outcome"] = _failure_outcome(exc)
    groups = []
    for journey in JOURNEYS:
        rows = [row for row in results if row["journey"] == journey]
        passed = sum(row.get("first_pass_contract_valid") is True for row in rows)
        available_reviews = sum(row["outcome"] == "application_completed" for row in rows)
        groups.append(
            {
                "provider": provider_name,
                "journey": journey,
                "cases": len(rows),
                "first_pass_contract_rate": passed / len(rows) if rows else 0,
                "coverage_met": len(rows) >= 30,
                "contract_threshold_met": len(rows) >= 30 and passed / len(rows) >= 0.95,
                "review_required": 10,
                "review_available": min(available_reviews, 10),
                "human_threshold": 0.9,
                "human_threshold_met": False,
                "outcomes": dict(Counter(row["outcome"] for row in rows)),
            }
        )
    return {
        "scope": "application_generation_services",
        "release_ready": False,
        "results": results,
        "groups": groups,
        "review_sheet": review_sheet,
        "limitations": [
            "Service execution only; no API authorization, retrieval or persistence coverage.",
            "Service completion includes repair/fallback; first_pass_contract_valid excludes them.",
            "Agent tools read only the supplied prepared context; no canonical lookup is executed.",
            "CV localization executes within draft generation using application runtime budgets.",
            "Prose cases require explicit canonical IDs, consent snapshots and matching facts.",
            "Hosted quality requires live provider evidence and independent human review.",
        ],
    }


def _validated_application_request(case: dict[str, Any]) -> BaseModel:
    from talentpulse_ai.modules.cv_analysis.schemas import MatchAnalysisRequest
    from talentpulse_ai.modules.cv_generator.schemas import CvDraftRequest
    from talentpulse_ai.modules.rag_chatbot.schemas import RagGenerateRequest

    if case.get("synthetic") is not True or not isinstance(case.get("request"), dict):
        raise ValueError("fixture_blocked")
    journey = case.get("journey")
    if journey not in JOURNEYS:
        raise ValueError("journey_not_implemented")
    if journey.startswith("RAG_") or journey == "CAREER_CHAT_AGENT":
        request = RagGenerateRequest.model_validate(case["request"])
        if journey != "CAREER_CHAT_AGENT" and journey != f"RAG_{request.intent}":
            raise ValueError("intent_mismatch")
        return request
    if journey == "CV_MATCH_ANALYSIS":
        return MatchAnalysisRequest.model_validate(case["request"])
    return CvDraftRequest.model_validate(case["request"])


def _first_pass_contract_valid(
    journey: str, response: dict[str, Any], metrics: dict[str, object] | None = None
) -> bool:
    if journey.startswith("RAG_") or journey == "CAREER_CHAT_AGENT":
        return response.get("source") == "llm" and response.get("degraded") is False
    if journey in {"CV_GENERATION", "CV_LOCALIZATION"}:
        call_kinds = (metrics or {}).get("provider_call_kinds", [])
        warnings = response.get("warnings", [])
        return (
            isinstance(call_kinds, list)
            and not any("repair" in str(kind) for kind in call_kinds)
            and not bool((metrics or {}).get("provider_timeout_count", 0))
            and not any("provenance=fallback" in str(item) for item in warnings)
        )
    return True


def validate_application_dataset(
    cases: list[dict[str, Any]], *, minimum_cases_per_journey: int = 30
) -> None:
    counts = Counter(case.get("journey") for case in cases)
    if any(counts[journey] < minimum_cases_per_journey for journey in JOURNEYS):
        raise ValueError("application_dataset_incomplete")
    try:
        for case in cases:
            _validated_application_request(case)
    except (KeyError, TypeError, ValidationError, ValueError):
        raise ValueError("application_dataset_incomplete") from None


def apply_human_reviews(report: dict[str, Any]) -> dict[str, Any]:
    groups = report.get("groups")
    reviews = report.get("review_sheet")
    if not isinstance(groups, list) or not groups or not isinstance(reviews, list):
        raise ValueError("invalid_review_report")

    rating_fields = ("relevance", "factual_accuracy", "usefulness", "grounding")
    review_keys: set[tuple[str, str, str]] = set()
    for review in reviews:
        if not isinstance(review, dict):
            raise ValueError("invalid_review_report")
        key = (review.get("provider"), review.get("journey"), review.get("case_id"))
        if not all(isinstance(value, str) and value for value in key) or key in review_keys:
            raise ValueError("invalid_review_report")
        review_keys.add(cast(tuple[str, str, str], key))
        values = [review.get(field) for field in rating_fields]
        review["pass"] = all(values) if all(isinstance(value, bool) for value in values) else None

    for group in groups:
        if not isinstance(group, dict):
            raise ValueError("invalid_review_report")
        required = group.get("review_required", 10)
        threshold = group.get("human_threshold", 0.9)
        if (
            type(required) is not int
            or required < 1
            or not isinstance(threshold, (int, float))
            or not isfinite(threshold)
            or not 0 <= threshold <= 1
        ):
            raise ValueError("invalid_review_report")
        matching = [
            review
            for review in reviews
            if review.get("provider") == group.get("provider")
            and review.get("journey") == group.get("journey")
            and isinstance(review.get("pass"), bool)
        ]
        passed = sum(review["pass"] is True for review in matching)
        rate = passed / len(matching) if matching else None
        group["reviewed_count"] = len(matching)
        group["human_pass_rate"] = rate
        group["human_threshold_met"] = (
            len(matching) >= required and rate is not None and rate >= threshold
        )

    report["quality_thresholds_met"] = all(
        group.get("coverage_met") is True
        and group.get("contract_threshold_met") is True
        and group.get("human_threshold_met") is True
        for group in groups
    )
    # Generation-service evidence alone cannot certify end-to-end release readiness.
    report["release_ready"] = False
    return report


def _live_provider(name: str) -> tuple[object, str]:
    # Lazy imports/configuration: importing this module never creates clients or reads secrets.
    import boto3  # type: ignore[import-untyped]
    from botocore.config import Config  # type: ignore[import-untyped]

    from talentpulse_ai.core.config import Settings
    from talentpulse_ai.infrastructure.llm.bedrock import BedrockNovaGenerationAdapter
    from talentpulse_ai.infrastructure.llm.gemini import GeminiGenerationAdapter

    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    adapter: Any
    if name == "gemini":
        if settings.gemini_api_key is None:
            raise ValueError("provider_configuration_failure")
        adapter = GeminiGenerationAdapter(
            settings.gemini_api_key.get_secret_value(),
            settings.gemini_model,
            settings.gemini_timeout_seconds,
        )
    else:
        if not settings.bedrock_model or not settings.bedrock_region:
            raise ValueError("provider_configuration_failure")
        client = boto3.client(
            "bedrock-runtime",
            region_name=settings.bedrock_region,
            config=Config(read_timeout=30, connect_timeout=5, retries={"total_max_attempts": 1}),
        )
        adapter = BedrockNovaGenerationAdapter(client, settings.bedrock_model)

    return adapter, str(adapter.model_name)


def _constant_provider_factory(provider: object) -> Callable[[], object]:
    return lambda: provider


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", required=True, choices=("gemini", "bedrock", "all"))
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--reviewed-report", type=Path)
    args = parser.parse_args()
    try:
        if args.reviewed_report is not None:
            report = apply_human_reviews(
                json.loads(args.reviewed_report.read_text(encoding="utf-8"))
            )
        else:
            cases = load_dataset(args.dataset)
            validate_application_dataset(cases)
            providers = {}
            profiles = {}
            for name in ("gemini", "bedrock") if args.provider == "all" else (args.provider,):
                providers[name], profiles[name] = _live_provider(name)
            provider_reports = [
                evaluate_application_journeys(
                    cases,
                    _constant_provider_factory(provider),
                    provider_name=name,
                )
                for name, provider in providers.items()
            ]
            report = {
                "scope": "application_generation_services",
                "release_ready": False,
                "profiles": profiles,
                "results": [row for item in provider_reports for row in item["results"]],
                "groups": [row for item in provider_reports for row in item["groups"]],
                "review_sheet": [row for item in provider_reports for row in item["review_sheet"]],
                "limitations": list(
                    dict.fromkeys(
                        message for item in provider_reports for message in item["limitations"]
                    )
                ),
            }
        if scan_sensitive(report):
            raise ValueError("unsafe_report")
        with args.output.open("x", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
    except Exception:
        print("Evaluation failed: dataset, configuration, or output rejected; details withheld.")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
