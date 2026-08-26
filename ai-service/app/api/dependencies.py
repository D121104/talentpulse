from __future__ import annotations

from fastapi import Depends

from app.security.dependencies import require_service_auth

service_auth = Depends(require_service_auth)
