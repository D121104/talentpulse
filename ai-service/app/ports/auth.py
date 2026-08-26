from __future__ import annotations

from typing import Protocol
from uuid import UUID


class ServiceAuthContext(Protocol):
    subject: str
    issuer: str
    audience: str
    scopes: frozenset[str]
    request_id: UUID


class ServiceTokenVerifier(Protocol):
    def verify(self, token: str, request_id: UUID) -> ServiceAuthContext: ...
