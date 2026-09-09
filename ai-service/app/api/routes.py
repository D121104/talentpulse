import base64
import binascii
from typing import Annotated, cast

from fastapi import APIRouter, Depends, Request

from app.api.auth import require_scope
from app.core.config import Settings, get_settings
from app.core.errors import ServiceError
from app.domain.contracts import CVParseRequest, CVParseResponse, MatchRequest, MatchResponse
from app.domain.matching import MatchService
from app.infrastructure.parsers import CVParser

router = APIRouter(prefix="/internal/v1/cv")


def _decode_content(value: str, settings: Settings) -> bytes:
    if len(value) > settings.max_encoded_upload_chars:
        raise ServiceError(
            "encoded_payload_too_large",
            "Encoded CV content exceeds the configured size limit.",
            413,
        )
    try:
        content = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ServiceError("invalid_base64", "content_base64 is not valid base64.") from exc
    if len(content) > settings.max_upload_bytes:
        raise ServiceError("payload_too_large", "CV file exceeds the configured size limit.", 413)
    return content


@router.post(
    "/parse",
    response_model=CVParseResponse,
    dependencies=[Depends(require_scope("cv_parse_scope"))],
)
def parse_cv(
    request: CVParseRequest, settings: Annotated[Settings, Depends(get_settings)]
) -> CVParseResponse:
    content = _decode_content(request.content_base64, settings)
    result = CVParser(settings).parse(content, request.media_type)
    return CVParseResponse(
        cv_id=request.cv_id,
        content_version=request.content_version,
        media_type=request.media_type,
        content_sha256=result.content_sha256,
        extracted_text=result.extracted_text,
        text_char_count=len(result.extracted_text),
        skills=result.skills,
        education=result.education,
        experience=result.experience,
        certificates=result.certificates,
        warnings=result.warnings,
        parser_version=result.parser_version,
    )


@router.post(
    "/match",
    response_model=MatchResponse,
    dependencies=[Depends(require_scope("cv_match_scope"))],
)
def match_cv(payload: MatchRequest, http_request: Request) -> MatchResponse:
    service = cast(MatchService, http_request.app.state.matching_service)
    response = service.match(payload)
    if (
        response.request_id != payload.identity.request_id
        or response.trace_id != payload.identity.trace_id
        or response.operation_attempt_id != payload.identity.operation_attempt_id
        or response.cv_id != payload.cv_id
        or response.job_id != payload.job_id
        or response.content_hash != payload.content_hash
        or response.content_version != payload.content_version
        or response.job_source_version != payload.job_source_version
        or response.idempotency_key != payload.idempotency_key
        or response.locale != payload.locale
    ):
        raise ServiceError(
            "invalid_match_provenance",
            "Match response provenance did not match the request.",
            502,
        )
    return response
