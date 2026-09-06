import base64
import binascii
from typing import Annotated

from fastapi import APIRouter, Depends

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
    text, digest = CVParser(settings).parse(content, request.media_type)
    return CVParseResponse(
        cv_id=request.cv_id,
        content_version=request.content_version,
        media_type=request.media_type,
        content_sha256=digest,
        extracted_text=text,
        text_char_count=len(text),
    )


@router.post(
    "/match",
    response_model=MatchResponse,
    dependencies=[Depends(require_scope("cv_match_scope"))],
)
def match_cv(request: MatchRequest) -> MatchResponse:
    return MatchService().match(request)
