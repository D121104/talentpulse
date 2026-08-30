from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from uuid import UUID

RESERVED_POINT_PAYLOAD_KEY = "_talentpulse_reserved"
RESERVED_POINT_PAYLOAD_VALUE = "collection_representation_metadata_v1"
RESERVED_POINT_SCHEMA_KEY = "_talentpulse_metadata_schema_version"
RESERVED_POINT_SCHEMA_VERSION = 1

# These values describe the serialized representation stored in the job index.
# Changing one requires a new collection/backfill rather than mixing vectors.
NORMALIZATION_VERSION = "nfkc-html-whitespace-v1"
CHUNKING_VERSION = "section-greedy-v1"
INDEX_SCHEMA_VERSION = "job-index-v1"

_SAFE_IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")


def validate_safe_identifier(value: object, field_name: str, max_length: int) -> str:
    """Validate a bounded identifier used by the index representation."""

    if (
        not isinstance(value, str)
        or not 1 <= len(value) <= max_length
        or _SAFE_IDENTIFIER_PATTERN.fullmatch(value) is None
    ):
        raise ValueError(f"{field_name} must be a bounded safe identifier")
    return value


@dataclass(frozen=True, slots=True)
class RepresentationManifest:
    """Server-owned description of the vector representation in use."""

    provider: str
    model: str
    dimensions: int
    normalization_version: str
    chunking_version: str
    index_schema_version: str
    physical_collection: str
    alias: str
    collection_version: str | None

    def __post_init__(self) -> None:
        validate_safe_identifier(self.provider, "embedding provider", 64)
        if (
            not isinstance(self.model, str)
            or not 1 <= len(self.model) <= 256
            or self.model != self.model.strip()
        ):
            raise ValueError("embedding model must be a bounded non-blank string")
        if (
            not isinstance(self.dimensions, int)
            or isinstance(self.dimensions, bool)
            or not 1 <= self.dimensions <= 4096
        ):
            raise ValueError("embedding dimensions must be between 1 and 4096")
        validate_safe_identifier(self.normalization_version, "normalization version", 64)
        validate_safe_identifier(self.chunking_version, "chunking version", 64)
        validate_safe_identifier(self.index_schema_version, "index schema version", 64)
        validate_safe_identifier(self.physical_collection, "physical collection", 255)
        validate_safe_identifier(self.alias, "alias", 255)
        if self.collection_version is not None:
            validate_safe_identifier(self.collection_version, "collection version", 128)

    @property
    def embedding_provider(self) -> str:
        return self.provider

    @property
    def embedding_model(self) -> str:
        return self.model

    @property
    def embedding_model_version(self) -> str:
        return self.model

    @property
    def embedding_dimensions(self) -> int:
        return self.dimensions

    @property
    def schema_version(self) -> str:
        return self.index_schema_version

    @property
    def physical_collection_name(self) -> str:
        return self.physical_collection

    @property
    def collection_name(self) -> str:
        return self.physical_collection

    @property
    def alias_name(self) -> str:
        return self.alias

    def as_dict(self) -> dict[str, object]:
        """Return only the stable manifest fields, never request metadata."""

        return {
            # Short names are retained for Phase 1 callers.
            "provider": self.provider,
            "model": self.model,
            "dimensions": self.dimensions,
            "normalization_version": self.normalization_version,
            "chunking_version": self.chunking_version,
            "index_schema_version": self.index_schema_version,
            "physical_collection": self.physical_collection,
            "alias": self.alias,
            "collection_version": self.collection_version,
            # Explicit names are the Phase 2 provider-parity contract.
            "embedding_provider": self.provider,
            "embedding_model_version": self.model,
            "embedding_dimensions": self.dimensions,
        }

    def __getitem__(self, key: str) -> object:
        aliases = {
            "embedding_provider": "provider",
            "embedding_model": "model",
            "embedding_model_version": "model",
            "embedding_dimensions": "dimensions",
            "schema_version": "index_schema_version",
            "physical_collection_name": "physical_collection",
            "collection_name": "physical_collection",
            "alias_name": "alias",
        }
        return self.as_dict()[aliases.get(key, key)]

    def model_dump(self) -> dict[str, object]:
        return self.as_dict()

    def to_metadata(self) -> dict[str, object]:
        """Return the bounded wire metadata used by indexed points/markers."""

        metadata: dict[str, object] = {
            "embedding_provider": self.provider,
            "embedding_model": self.model,
            "embedding_model_version": self.model,
            "embedding_dimensions": self.dimensions,
            "normalization_version": self.normalization_version,
            "chunking_version": self.chunking_version,
            "index_schema_version": self.index_schema_version,
            "collection_name": self.physical_collection,
        }
        if self.collection_version is not None:
            metadata["collection_version"] = self.collection_version
        return metadata

    def to_marker_metadata(self) -> dict[str, object]:
        """Return the exact non-searchable representation marker metadata."""

        metadata: dict[str, object] = {
            "foundation_version": "phase1",
            "embedding_model": self.model,
            "embedding_model_version": self.model,
            "embedding_dimensions": self.dimensions,
            "normalization_version": self.normalization_version,
            "chunking_version": self.chunking_version,
            "index_schema_version": self.index_schema_version,
            "embedding_provider": self.provider,
        }
        if self.collection_version is not None:
            metadata["collection_version"] = self.collection_version
        return metadata

    def to_marker_payload(self) -> dict[str, object]:
        """Return the complete exact payload used by the reserved marker point."""

        return {
            RESERVED_POINT_PAYLOAD_KEY: RESERVED_POINT_PAYLOAD_VALUE,
            RESERVED_POINT_SCHEMA_KEY: RESERVED_POINT_SCHEMA_VERSION,
            **self.to_marker_metadata(),
        }


# Qdrant 1.13 accepts the newer collection-metadata request shape but does not
# expose the value again from collection info.  The Qdrant adapter therefore
# uses one reserved point as a durable compatibility marker.  Keep this point
# outside the job-point ID namespace and never put searchable text or PII in it.
REPRESENTATION_METADATA_POINT_ID = UUID("f1b2c3d4-e5f6-4789-a012-3456789abcde")
RESERVED_POINT_PAYLOAD_KEY = "_talentpulse_reserved"
RESERVED_POINT_PAYLOAD_VALUE = "collection_representation_metadata_v1"
RESERVED_POINT_SCHEMA_KEY = "_talentpulse_metadata_schema_version"
RESERVED_POINT_SCHEMA_VERSION = 1


def is_reserved_metadata_payload(value: object) -> bool:
    return isinstance(value, Mapping) and value.get(RESERVED_POINT_PAYLOAD_KEY) == (
        RESERVED_POINT_PAYLOAD_VALUE
    )
