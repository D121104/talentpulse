from dataclasses import dataclass


@dataclass(slots=True)
class ServiceError(Exception):
    code: str
    message: str
    status_code: int = 400

    def __str__(self) -> str:
        return self.message


class ProviderFailure(RuntimeError):
    """Internal marker for failures at embedding, vector, or generation boundaries."""
