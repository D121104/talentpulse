from __future__ import annotations


class DeterministicGenerationProvider:
    """Offline provider that deliberately exercises the safe deterministic fallback."""

    def generate(self, prompt: str) -> object:
        del prompt
        return None
