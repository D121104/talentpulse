from __future__ import annotations

import os
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import uvicorn
from app.application.generation import DeterministicGenerationProvider
from app.core.config import Settings
from app.domain.rag import RetrievedChunk
from app.infrastructure.rag_providers import (
    DeterministicEmbeddingProvider,
    InMemoryVectorRetriever,
)
from app.main import create_app

JOB_ID = UUID("77777777-7777-4777-8777-777777777777")


def build_application():
    dimensions = 32
    retriever = InMemoryVectorRetriever(
        chunks=[
            RetrievedChunk(
                JOB_ID,
                0.93,
                {
                    "job_id": str(JOB_ID),
                    "title": "Backend Engineer",
                    "company_name": "Synthetic Systems",
                    "company_id": "88888888-8888-4888-8888-888888888888",
                    "location": "Hanoi",
                    "level": "senior",
                    "salary": "3000",
                    "salary_currency": "USD",
                    "skills": "Python,PostgreSQL",
                    "is_active": "true",
                    "is_deleted": "false",
                    "company_is_active": "true",
                    "company_is_deleted": "false",
                },
            )
        ],
        dimensions=dimensions,
    )
    settings = Settings(
        environment="demo",
        auth_required=True,
        jwt_algorithms=("RS256",),
        jwt_public_key=os.environ["AI_JWT_PUBLIC_KEY"],
        jwt_issuer="https://issuer.example",
        jwt_audience="talentpulse-ai",
        jwt_subject="talentpulse-backend",
        embedding_provider="cohere",
        vector_store_provider="qdrant",
        generation_provider="bedrock",
        cohere_dimensions=dimensions,
    )
    return create_app(
        settings,
        embedding_provider=DeterministicEmbeddingProvider(dimensions),
        vector_retriever=retriever,
        generation_provider=DeterministicGenerationProvider(),
    )


if __name__ == "__main__":
    uvicorn.run(build_application(), host="127.0.0.1", port=0, log_level="info")
