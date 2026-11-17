from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from talentpulse_ai.agent_foundation.approval import (
    ApprovalDecision,
    ApprovalErrorCode,
    ApprovalManager,
    ApprovalResult,
    ApprovalValidationError,
)
from talentpulse_ai.core.security import require_scope

router = APIRouter(prefix="/internal/v1/agent-executions", tags=["agent-foundation"])
_agent_resume_authorization = require_scope("agent_resume_scope")


@router.post("/{approval_id}/resume", response_model=ApprovalResult)
def resume_approval(
    approval_id: UUID,
    payload: ApprovalDecision,
    request: Request,
    service_identity: Annotated[dict[str, Any], Depends(_agent_resume_authorization)],
) -> ApprovalResult:
    del service_identity
    if payload.approval_id != approval_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_decision", "message": "Approval decision is invalid."},
        )
    manager = getattr(request.app.state, "approval_manager", None)
    if not isinstance(manager, ApprovalManager):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "approval_unavailable", "message": "Approval resume is unavailable."},
        )
    try:
        return manager.resume(payload)
    except ApprovalValidationError as exc:
        http_status = _approval_error_status(exc.code)
        raise HTTPException(
            status_code=http_status,
            detail={"code": exc.code.value.lower(), "message": exc.safe_message},
        ) from None


def _approval_error_status(error_code: ApprovalErrorCode) -> int:
    if error_code is ApprovalErrorCode.NOT_FOUND:
        return status.HTTP_404_NOT_FOUND
    if error_code is ApprovalErrorCode.INVALID_DECISION:
        return status.HTTP_422_UNPROCESSABLE_ENTITY
    if error_code is ApprovalErrorCode.ACTION_UNAVAILABLE:
        return status.HTTP_503_SERVICE_UNAVAILABLE
    if error_code is ApprovalErrorCode.ACTION_FAILED:
        return status.HTTP_502_BAD_GATEWAY
    return status.HTTP_409_CONFLICT
