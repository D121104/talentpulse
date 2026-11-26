import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from talentpulse_ai.core.config import Settings, get_settings
from talentpulse_ai.main import create_app


def make_token(scope: str) -> str:
    return jwt.encode(
        {
            "sub": "backend-service",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
            "scope": scope,
        },
        "test-only-agent-resume-signing-key",
        algorithm="HS256",
    )


def test_internal_resume_route_requires_dedicated_service_scope() -> None:
    settings = Settings(
        _env_file=None,
        environment="test",
        auth_required=True,
        jwt_secret="test-only-agent-resume-signing-key",
        jwt_algorithms=("HS256",),
        jwt_issuer=None,
        jwt_audience=None,
    )
    application = create_app(settings)
    application.dependency_overrides[get_settings] = lambda: settings
    approval_id = uuid4()
    payload = {
        "approval_id": str(approval_id),
        "decision": "APPROVE",
        "decision_id": str(uuid4()),
        "operation_ref": "synthetic-operation",
        "expected_version": "version-1",
    }

    with TestClient(application) as client:
        unauthenticated = client.post(
            f"/internal/v1/agent-executions/{approval_id}/resume",
            json=payload,
        )
        wrong_scope = client.post(
            f"/internal/v1/agent-executions/{approval_id}/resume",
            json=payload,
            headers={"Authorization": f"Bearer {make_token('rag:generate')}"},
        )
        allowed_scope = client.post(
            f"/internal/v1/agent-executions/{approval_id}/resume",
            json=payload,
            headers={"Authorization": f"Bearer {make_token('agent:resume')}"},
        )

    assert unauthenticated.status_code == 401
    assert wrong_scope.status_code == 403
    assert allowed_scope.status_code == 503
    assert allowed_scope.json()["detail"]["code"] == "approval_unavailable"


def test_app_lifespan_owns_optional_checkpoint_pool() -> None:
    database_url = os.environ.get("AGENT_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("AGENT_TEST_DATABASE_URL must point to a dedicated migrated test database")
    settings = Settings(
        _env_file=None,
        environment="test",
        auth_required=False,
        agent_checkpoint_database_url=SecretStr(database_url),
    )
    application = create_app(settings)

    with TestClient(application):
        checkpointer = application.state.agent_checkpointer
        assert checkpointer is not None
        assert checkpointer.is_open
        assert application.state.approval_manager is not None

    assert checkpointer.is_open is False
