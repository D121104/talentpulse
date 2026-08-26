from __future__ import annotations

import asyncio

from app.core.errors import InvalidModelOutputError, ProviderError
from app.ports import ChatModel, ChatRequest, ChatResponse


class BedrockNovaLiteChatModel(ChatModel):
    provider_name = "bedrock"

    def __init__(self, region: str, model_name: str, timeout_seconds: float = 30.0) -> None:
        self.region = region
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds

    def _complete_sync(self, request: ChatRequest) -> ChatResponse:
        try:
            import boto3

            client = boto3.client("bedrock-runtime", region_name=self.region)
            response = client.converse(
                modelId=self.model_name,
                system=[{"text": request.system_instruction}],
                messages=[{"role": "user", "content": [{"text": request.user_content}]}],
                inferenceConfig={
                    "maxTokens": request.max_output_tokens,
                    "temperature": request.temperature,
                },
            )
        except Exception as exc:
            raise ProviderError() from exc
        content = response.get("output", {}).get("message", {}).get("content", [])
        text_parts = [item.get("text", "") for item in content if isinstance(item, dict)]
        text = "".join(part for part in text_parts if isinstance(part, str)).strip()
        if not text:
            raise InvalidModelOutputError()
        usage = response.get("usage", {})
        return ChatResponse(
            text,
            self.model_name,
            self.provider_name,
            response.get("stopReason"),
            {
                key: int(value)
                for key, value in usage.items()
                if key in {"inputTokens", "outputTokens", "totalTokens"} and isinstance(value, int)
            },
        )

    async def complete(self, request: ChatRequest) -> ChatResponse:
        return await asyncio.to_thread(self._complete_sync, request)

    async def health(self) -> bool:
        return True  # Readiness must not make a paid provider call on every probe.
