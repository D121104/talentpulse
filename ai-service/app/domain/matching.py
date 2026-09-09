from __future__ import annotations

from dataclasses import dataclass
from math import isfinite, sqrt
from typing import Protocol

from app.domain.contracts import CVProfile, JobProfile, MatchComponent, MatchRequest, MatchResponse


class SemanticScorer(Protocol):
    version: str

    def score(self, candidate: CVProfile, job: JobProfile) -> float | None: ...


class EmbeddingProvider(Protocol):
    dimensions: int

    def embed_query(self, text: str) -> list[float]: ...


@dataclass(frozen=True, slots=True)
class UnavailableSemanticScorer:
    version: str = "unavailable-v1"

    def score(self, candidate: CVProfile, job: JobProfile) -> float | None:
        del candidate, job
        return None


@dataclass(slots=True)
class EmbeddingSemanticScorer:
    """Compute semantic similarity from the configured provider, not an LLM judgment."""

    provider: EmbeddingProvider
    version: str = "embedding-semantic-v1"

    def score(self, candidate: CVProfile, job: JobProfile) -> float | None:
        try:
            candidate_vector = self.provider.embed_query(_profile_text(candidate))
            job_vector = self.provider.embed_query(_profile_text(job))
            if not candidate_vector or len(candidate_vector) != len(job_vector):
                return None
            values = [*candidate_vector, *job_vector]
            if not all(
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and isfinite(float(value))
                for value in values
            ):
                return None
            candidate_norm = sqrt(sum(float(value) ** 2 for value in candidate_vector))
            job_norm = sqrt(sum(float(value) ** 2 for value in job_vector))
            if candidate_norm == 0 or job_norm == 0:
                return None
            cosine = sum(
                float(left) * float(right)
                for left, right in zip(candidate_vector, job_vector, strict=True)
            ) / (candidate_norm * job_norm)
            # MatchResponse uses [0, 1], while cosine similarity is [-1, 1].
            return min(1.0, max(0.0, (cosine + 1.0) / 2.0))
        except Exception:
            # Provider failures degrade matching without exposing provider details.
            return None


def _profile_text(profile: CVProfile | JobProfile) -> str:
    """Build a bounded semantic representation from non-sensitive structured fields."""
    if isinstance(profile, CVProfile):
        skills = profile.skills
        years_experience = profile.years_experience
        level = profile.level
    else:
        skills = [*profile.required_skills, *profile.preferred_skills]
        years_experience = profile.min_years_experience
        level = profile.level
    skill_text = ", ".join(_bounded_items(skills, 3_000))
    parts = [f"skills: {skill_text}" if skill_text else "skills: none"]
    if years_experience is not None:
        parts.append(f"experience years: {years_experience:g}")
    if level is not None:
        parts.append(f"level: {level.value}")
    return " | ".join(parts)[:4_000]


def _bounded_items(values: list[str], max_chars: int) -> list[str]:
    result: list[str] = []
    used = 0
    for value in values:
        item = value.strip()[:100]
        if not item:
            continue
        separator = 2 if result else 0
        if used + separator + len(item) > max_chars:
            break
        result.append(item)
        used += separator + len(item)
    return result


class MatchService:
    SCORING_VERSION = "cv-job-match-v2"
    _base_weights = {"semantic": 0.50, "skills": 0.35, "experience": 0.15}
    _level_order = {"intern": 0, "junior": 1, "mid": 2, "senior": 3, "lead": 4, "principal": 5}
    _skill_aliases = {
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

    def __init__(self, semantic_scorer: SemanticScorer | None = None) -> None:
        self._semantic = semantic_scorer or UnavailableSemanticScorer()

    def match(self, request: MatchRequest) -> MatchResponse:
        if not isinstance(request, MatchRequest):
            raise TypeError("request must be MatchRequest")
        candidate, job = request.candidate, request.job
        candidate_skills = {self._normalize(skill) for skill in candidate.skills}
        required = self._ordered_unique(job.required_skills)
        preferred = self._ordered_unique(job.preferred_skills)
        matched_required = [raw for key, raw in required if key in candidate_skills]
        missing_required = [raw for key, raw in required if key not in candidate_skills]
        matched_preferred = [raw for key, raw in preferred if key in candidate_skills]
        matched_skills = self._merge_unique(matched_required, matched_preferred)

        components: dict[str, tuple[float, list[str]]] = {}
        semantic = self._semantic.score(candidate, job)
        if semantic is not None:
            if not isfinite(semantic) or not 0 <= semantic <= 1:
                raise ValueError("semantic scorer must return a score between 0 and 1")
            components["semantic"] = (semantic, [f"semantic scorer={self._semantic.version}"])

        skill_score, skill_evidence = self._skill_score(
            required, preferred, matched_required, matched_preferred
        )
        if skill_score is not None:
            components["skills"] = (skill_score, skill_evidence)

        experience_score, experience_evidence = self._experience_score(candidate, job)
        if experience_score is not None:
            components["experience"] = (experience_score, experience_evidence)

        available_weight = sum(self._base_weights[name] for name in components)
        overall = (
            sum(score * self._base_weights[name] for name, (score, _) in components.items())
            / available_weight
            if available_weight
            else 0.0
        )
        overall = min(1.0, max(0.0, overall))

        response_components = {
            name: MatchComponent(
                score=score,
                weight=self._base_weights[name] / available_weight if available_weight else 0.0,
                available=True,
                evidence=evidence,
            )
            for name, (score, evidence) in components.items()
        }
        location_score, location_evidence, location_available = self._location_compatibility(
            candidate, job
        )
        response_components["location"] = MatchComponent(
            score=location_score,
            weight=0.0,
            available=location_available,
            evidence=location_evidence,
        )
        work_mode_score, work_mode_evidence, work_mode_available = self._work_mode_compatibility(
            candidate, job
        )
        response_components["work_mode"] = MatchComponent(
            score=work_mode_score,
            weight=0.0,
            available=work_mode_available,
            evidence=work_mode_evidence,
        )

        strengths: list[str] = []
        if matched_required:
            strengths.append(f"Matches {len(matched_required)} required skill(s).")
        if matched_preferred:
            strengths.append(f"Matches {len(matched_preferred)} preferred skill(s).")
        if experience_score is not None and experience_score >= 0.8:
            strengths.append("Experience and level are compatible with the job.")
        gaps = [f"Missing required skill: {skill}." for skill in missing_required[:10]]
        if experience_score is not None and experience_score < 0.8:
            gaps.append("Experience or level does not fully match the job.")
        if location_available and location_score == 0:
            gaps.append("Location is not compatible; it is excluded from the score.")
        if work_mode_available and work_mode_score == 0:
            gaps.append("Work mode is not compatible; it is excluded from the score.")
        degraded = semantic is None
        explanation = self._explanation(overall, strengths, gaps, degraded)
        return MatchResponse(
            request_id=request.identity.request_id,
            trace_id=request.identity.trace_id,
            operation_attempt_id=request.identity.operation_attempt_id,
            cv_id=request.cv_id,
            job_id=request.job_id,
            content_hash=request.content_hash,
            content_version=request.content_version,
            job_source_version=request.job_source_version,
            idempotency_key=request.idempotency_key,
            locale=request.locale,
            overall_score=overall,
            components=response_components,
            matched_skills=matched_skills,
            missing_required_skills=missing_required,
            strengths=strengths,
            gaps=gaps[:20],
            explanation=explanation,
            degraded=degraded,
            scoring_version=self.SCORING_VERSION,
            semantic_component_version=self._semantic.version,
        )

    def _skill_score(
        self,
        required: list[tuple[str, str]],
        preferred: list[tuple[str, str]],
        matched_required: list[str],
        matched_preferred: list[str],
    ) -> tuple[float | None, list[str]]:
        if not required and not preferred:
            return None, []
        required_coverage = (
            len({self._normalize(skill) for skill in matched_required}) / len(required)
            if required
            else 0.0
        )
        preferred_coverage = (
            len({self._normalize(skill) for skill in matched_preferred}) / len(preferred)
            if preferred
            else 0.0
        )
        score = (
            required_coverage * 0.8 + preferred_coverage * 0.2 if preferred else required_coverage
        )
        evidence = (
            [f"required skills matched {len(matched_required)}/{len(required)}"] if required else []
        )
        if preferred:
            evidence.append(f"preferred skills matched {len(matched_preferred)}/{len(preferred)}")
        evidence.append("uncertain skills: none reported by the structured input")
        return score, evidence

    @staticmethod
    def _normalize(value: str) -> str:
        normalized = (
            value.casefold()
            .strip()
            .replace(".", "")
            .replace("-", " ")
            .replace("_", " ")
            .replace("/", " ")
        )
        normalized = " ".join(normalized.split())
        return MatchService._skill_aliases.get(normalized, normalized)

    def _ordered_unique(self, values: list[str]) -> list[tuple[str, str]]:
        result: list[tuple[str, str]] = []
        seen: set[str] = set()
        for value in values:
            key = self._normalize(value)
            if key and key not in seen:
                seen.add(key)
                result.append((key, value))
        return result

    @staticmethod
    def _merge_unique(*groups: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for group in groups:
            for value in group:
                key = MatchService._normalize(value)
                if key not in seen:
                    seen.add(key)
                    result.append(value)
        return result

    def _experience_score(
        self, candidate: CVProfile, job: JobProfile
    ) -> tuple[float | None, list[str]]:
        signals: list[float] = []
        evidence: list[str] = []
        if job.min_years_experience is not None or job.max_years_experience is not None:
            if candidate.years_experience is not None:
                years = candidate.years_experience
                if job.min_years_experience is not None and years < job.min_years_experience:
                    years_score = (
                        years / job.min_years_experience if job.min_years_experience else 1.0
                    )
                elif job.max_years_experience is not None and years > job.max_years_experience:
                    years_score = 1 - (years - job.max_years_experience) / 10
                else:
                    years_score = 1.0
                signals.append(min(1.0, max(0.0, years_score)))
                evidence.append(f"candidate has {years:g} year(s) of experience")
        if job.level is not None and candidate.level is not None:
            distance = abs(
                self._level_order[candidate.level.value] - self._level_order[job.level.value]
            )
            signals.append(max(0.0, 1 - distance * 0.25))
            evidence.append(f"candidate level={candidate.level.value}, job level={job.level.value}")
        return (sum(signals) / len(signals), evidence) if signals else (None, [])

    @staticmethod
    def _location_compatibility(
        candidate: CVProfile, job: JobProfile
    ) -> tuple[float, list[str], bool]:
        if candidate.location is None or job.location is None:
            return 0.0, ["location compatibility unavailable: both locations are required"], False
        candidate_location = " ".join(candidate.location.casefold().split())
        job_location = " ".join(job.location.casefold().split())
        matched = candidate_location == job_location
        return float(matched), [f"location match={matched}"], True

    @staticmethod
    def _work_mode_compatibility(
        candidate: CVProfile, job: JobProfile
    ) -> tuple[float, list[str], bool]:
        if not candidate.work_modes or not job.work_modes:
            return (
                0.0,
                ["work-mode compatibility unavailable: both work-mode lists are required"],
                False,
            )
        overlap = set(candidate.work_modes).intersection(job.work_modes)
        return float(bool(overlap)), [f"work mode overlap={bool(overlap)}"], True

    @staticmethod
    def _explanation(score: float, strengths: list[str], gaps: list[str], degraded: bool) -> str:
        prefix = (
            "Deterministic match score; semantic scoring is unavailable, so available weights were "
            "renormalized. "
            if degraded
            else "Deterministic match score. "
        )
        body = (
            f"Overall score: {score:.2f}. Location and work-mode compatibility are reported "
            "separately and excluded from the score."
        )
        if strengths:
            body += " Strengths: " + " ".join(strengths)
        if gaps:
            body += " Gaps: " + " ".join(gaps)
        return prefix + body
