from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Self
from uuid import UUID

from langgraph.checkpoint.base import CheckpointTuple
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import SecretStr


class AgentCheckpointer:
    """Own a least-privilege pool for the approval checkpoint schema only."""

    def __init__(self, database_url: SecretStr | str) -> None:
        connection_string = (
            database_url.get_secret_value() if isinstance(database_url, SecretStr) else database_url
        )
        self._pool: ConnectionPool[Connection[dict[str, Any]]] = ConnectionPool(
            conninfo=connection_string,
            kwargs={
                "autocommit": True,
                "options": "-c search_path=agent_checkpoint",
                "prepare_threshold": 0,
                "row_factory": dict_row,
            },
            min_size=1,
            max_size=4,
            open=False,
        )
        self._saver = PostgresSaver(self._pool)

    @property
    def saver(self) -> PostgresSaver:
        return self._saver

    @property
    def is_open(self) -> bool:
        return not self._pool.closed

    def open(self) -> None:
        self._pool.open(wait=True)

    def close(self) -> None:
        self._pool.close()

    def __enter__(self) -> Self:
        self.open()
        return self

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        del exc_type, exc_value, traceback
        self.close()

    def get_checkpoint(self, approval_id: UUID) -> CheckpointTuple | None:
        return self._saver.get_tuple(
            {"configurable": {"thread_id": str(approval_id), "checkpoint_ns": ""}}
        )

    def delete_thread(self, approval_id: UUID) -> None:
        self._saver.delete_thread(str(approval_id))

    def cleanup_expired(
        self,
        now: datetime | None = None,
        *,
        exclude_approval_id: UUID | None = None,
    ) -> int:
        expiry = now or datetime.now(UTC)
        if expiry.tzinfo is None or expiry.utcoffset() is None:
            raise ValueError("cleanup time must be timezone-aware")
        query = (
            "SELECT DISTINCT thread_id "
            "FROM checkpoints "
            "WHERE metadata ? 'agent_approval_expires_at' "
            "AND metadata->>'agent_approval_expires_at' <= %s"
        )
        parameters: tuple[object, ...] = (
            expiry.astimezone(UTC).isoformat(timespec="microseconds"),
        )
        if exclude_approval_id is not None:
            query += " AND thread_id <> %s"
            parameters = (*parameters, str(exclude_approval_id))
        with self._pool.connection() as connection:
            rows = connection.execute(query, parameters).fetchall()
        thread_ids = [row["thread_id"] for row in rows]
        for thread_id in thread_ids:
            self._saver.delete_thread(thread_id)
        return len(thread_ids)
