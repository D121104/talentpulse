from __future__ import annotations

import httpx

from app.core.errors import InvalidModelOutputError, ProviderError
from app.ports import ChatModel, ChatRequest, ChatResponse


class OllamaChatModel(ChatModel):
    provider_name = "ollama"

    def __init__(self, base_url: str, model_name: str, timeout_seconds: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds

    async def complete(self, request: ChatRequest) -> ChatResponse:
        payload = {
            "model": self.model_name,
            "stream": False,
            "options": {
                "temperature": request.temperature,
                "num_predict": request.max_output_tokens,
            },
            "messages": [
                {"role": "system", "content": request.system_instruction},
                {"role": "user", "content": request.user_content},
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(f"{self.base_url}/api/chat", json=payload)
                response.raise_for_status()
                body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderError() from exc
        message = body.get("message")
        text = message.get("content") if isinstance(message, dict) else None
        if not isinstance(text, str) or not text.strip():
            raise InvalidModelOutputError()
        return ChatResponse(
            text=text,
            model=self.model_name,
            provider=self.provider_name,
            finish_reason=body.get("done_reason")
            if isinstance(body.get("done_reason"), str)
            else None,
        )

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
            return response.is_success
        except httpx.HTTPError:
            return False
