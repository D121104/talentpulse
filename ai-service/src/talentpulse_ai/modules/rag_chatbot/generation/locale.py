from __future__ import annotations

import re
from typing import Final, Literal

from talentpulse_ai.modules.rag_chatbot.schemas import ProviderGeneration, RagGenerateRequest

OutputLocale = Literal["en", "vi"]

_WORD_RE = re.compile(r"[A-Za-zÀ-ỹĐđ]+")
_VIETNAMESE_WORDS: Final = frozenset(
    {
        "bạn",
        "các",
        "cần",
        "cho",
        "có",
        "công",
        "đây",
        "để",
        "địa",
        "điểm",
        "được",
        "hãy",
        "hợp",
        "khi",
        "không",
        "kỹ",
        "làm",
        "là",
        "lương",
        "mình",
        "muốn",
        "một",
        "năng",
        "này",
        "nên",
        "nghiệm",
        "phân",
        "phù",
        "quả",
        "sánh",
        "so",
        "tôi",
        "tìm",
        "trợ",
        "tuyển",
        "việc",
        "vị",
        "với",
        "về",
        "ở",
    }
)
_VIETNAMESE_STRONG_WORDS: Final = frozenset(
    {
        "bạn",
        "cần",
        "có",
        "công",
        "đây",
        "để",
        "được",
        "hãy",
        "không",
        "là",
        "lương",
        "mình",
        "muốn",
        "một",
        "nên",
        "tìm",
        "tôi",
        "tuyển",
        "việc",
        "với",
        "về",
        "ở",
    }
)
_ENGLISH_WORDS: Final = frozenset(
    {
        "a",
        "about",
        "advice",
        "align",
        "aligned",
        "an",
        "and",
        "apply",
        "are",
        "as",
        "available",
        "background",
        "be",
        "best",
        "can",
        "candidate",
        "consider",
        "could",
        "currently",
        "define",
        "for",
        "find",
        "from",
        "gap",
        "gaps",
        "give",
        "great",
        "grounded",
        "has",
        "have",
        "here",
        "hiring",
        "in",
        "is",
        "it",
        "job",
        "jobs",
        "match",
        "matched",
        "matching",
        "my",
        "need",
        "no",
        "of",
        "on",
        "opportunity",
        "options",
        "please",
        "position",
        "profile",
        "provided",
        "recommend",
        "relevant",
        "role",
        "roles",
        "suitable",
        "the",
        "these",
        "this",
        "to",
        "use",
        "with",
        "well",
        "your",
        "you",
    }
)
_ENGLISH_CONTENT_WORDS: Final = frozenset(
    {
        "advice",
        "align",
        "aligned",
        "apply",
        "background",
        "best",
        "candidate",
        "consider",
        "define",
        "find",
        "give",
        "great",
        "grounded",
        "hiring",
        "match",
        "matched",
        "matching",
        "need",
        "opportunity",
        "options",
        "position",
        "profile",
        "provided",
        "recommend",
        "relevant",
        "role",
        "roles",
        "suitable",
        "use",
    }
)
_VIETNAMESE_DIACRITICS: Final = frozenset(
    "ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ"
)
_TECHNICAL_METADATA_RE = re.compile(
    r"(?:\b(?:job_ids?|referenced_job_ids|answer_blocks|claims|components)\b|"
    r"\bcitation(?:_keys?| keys?)?\b|\bretrieval_evidence\b|"
    r"\bjob:[0-9a-f]{8}-[0-9a-f-]{27,}\b)",
    re.IGNORECASE,
)


def _detected_message_locale(text: str) -> OutputLocale | None:
    tokens = [token.casefold() for token in _WORD_RE.findall(text)]
    vietnamese_words = sum(token in _VIETNAMESE_WORDS for token in tokens)
    strong_vietnamese_words = sum(token in _VIETNAMESE_STRONG_WORDS for token in tokens)
    english_words = sum(token in _ENGLISH_WORDS for token in tokens)
    diacritics = sum(character.casefold() in _VIETNAMESE_DIACRITICS for character in text)
    vietnamese_score = vietnamese_words + (2 * strong_vietnamese_words) + min(diacritics, 6)
    english_score = 2 * english_words
    if vietnamese_score >= 4 and vietnamese_score >= english_score:
        return "vi"
    if english_score >= 4 and english_score > vietnamese_score:
        return "en"
    return None


def _requested_locale(value: str) -> OutputLocale | None:
    language = value.casefold().split("-", 1)[0]
    if language in {"en", "vi"}:
        return language  # type: ignore[return-value]
    return None


def _effective_locale(request: RagGenerateRequest) -> OutputLocale:
    # The caller/session locale is authoritative. Message detection is only a compatibility
    # fallback for unsupported or legacy locale values and never reads retrieved job text.
    requested = _requested_locale(request.locale)
    return requested or _detected_message_locale(request.normalized_user_message) or "en"


def _canonical_answer_terms(request: RagGenerateRequest) -> tuple[str, ...]:
    values: list[str] = []
    for job in request.canonical_active_job_context:
        values.extend(
            value
            for value in (
                job.title,
                job.company_name,
                job.location,
                job.level,
                job.salary.currency if job.salary is not None else None,
                *job.skills,
            )
            if value is not None
        )
    if request.authorized_cv_snapshot is not None:
        cv = request.authorized_cv_snapshot
        values.extend(
            value
            for value in (
                cv.title,
                cv.target,
                *cv.skills,
                *cv.education,
                *cv.experience,
                *cv.certificates,
            )
            if value is not None
        )
    normalized: set[str] = set()
    for value in values:
        term = " ".join(value.casefold().split())
        if term:
            normalized.add(term)
    return tuple(sorted(normalized, key=len, reverse=True))


def _without_canonical_answer_terms(text: str, request: RagGenerateRequest) -> tuple[str, bool]:
    remaining = text
    matched = False
    for term in _canonical_answer_terms(request):
        pattern = re.compile(
            r"(?<!\w)" + r"\s+".join(re.escape(part) for part in term.split()) + r"(?!\w)",
            re.IGNORECASE,
        )
        remaining, substitutions = pattern.subn(" ", remaining)
        matched = matched or substitutions > 0
    return remaining, matched


def _language_scores(text: str) -> tuple[int, int, int, int]:
    tokens = [token.casefold() for token in _WORD_RE.findall(text)]
    vietnamese_hits = sum(token in _VIETNAMESE_WORDS for token in tokens)
    strong_vietnamese_hits = sum(token in _VIETNAMESE_STRONG_WORDS for token in tokens)
    english_hits = sum(token in _ENGLISH_WORDS for token in tokens)
    english_content_hits = sum(token in _ENGLISH_CONTENT_WORDS for token in tokens)
    unknown_tokens = sum(
        token not in _VIETNAMESE_WORDS and token not in _ENGLISH_WORDS for token in tokens
    )
    vietnamese_score = vietnamese_hits + (2 * strong_vietnamese_hits)
    if any(character.casefold() in _VIETNAMESE_DIACRITICS for character in text):
        vietnamese_score += min(
            sum(
                any(character.casefold() in _VIETNAMESE_DIACRITICS for character in token)
                for token in tokens
            ),
            4,
        )
    return vietnamese_score, english_hits, english_content_hits, unknown_tokens


def _has_unsupported_letters(text: str) -> bool:
    return any(
        character.isalpha()
        and not (
            "a" <= character.casefold() <= "z" or character.casefold() in _VIETNAMESE_DIACRITICS
        )
        for character in text
    )


def _generated_answer_matches_locale(
    request: RagGenerateRequest, generated: ProviderGeneration
) -> bool:
    text = "\n".join(block.text for block in generated.answer_blocks).strip()
    if not text:
        return False
    language_text, has_canonical_term = _without_canonical_answer_terms(text, request)
    if _TECHNICAL_METADATA_RE.search(text):
        # User-facing text must not expose internal identifiers; structured response fields
        # retain the traceable job IDs and citation keys.
        return False
    if not language_text.strip():
        # A terse answer made only of an authorized title/skill is still meaningful. Do not force
        # it through sentence-level language detection, especially for short technical names.
        return has_canonical_term
    if _has_unsupported_letters(language_text):
        return False
    vietnamese_score, english_hits, _, _ = _language_scores(language_text)
    tokens = _WORD_RE.findall(language_text)
    # Reject confident foreign-language signals, not missing vocabulary hits. Short
    # ambiguous words such as English "so" must not imply Vietnamese by themselves.
    foreign_markers = {"bonjour", "voici", "les", "offres", "avec", "vous", "votre"}
    if sum(token.casefold() in foreign_markers for token in tokens) >= 2:
        return False
    # Recognizable keyboard-placeholder noise is invalid output, but unfamiliar
    # consonant-heavy technical names (for example grpc) are not language errors.
    if len(tokens) >= 2 and all(token.casefold() in {"asdf", "qwer", "zxcv"} for token in tokens):
        return False
    locale = _effective_locale(request)
    if locale == "vi":
        return not (english_hits >= 2 and english_hits > vietnamese_score)
    return not (vietnamese_score >= 4 and vietnamese_score > english_hits)
