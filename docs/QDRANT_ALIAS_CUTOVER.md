# Qdrant alias cutover runbook

`QdrantAliasManager` is an explicit operator-only boundary for switching or
rolling back the active Qdrant alias. It is intentionally not registered as a
FastAPI route and is not called by readiness, startup, indexing, or normal
point operations. No CLI wrapper is provided, so credentials are not placed in
command arguments or shell history.

## Preconditions

Before a cutover, the target physical collection must already be built and
validated by the indexing workflow:

- vector size and `Cosine` distance match the target
- the reserved representation marker exactly matches the
  `RepresentationManifest`
- the required payload indexes already exist with the expected types
- the target has been fully reindexed and its physical collection name is
  unique
- the operator has recorded the exact current alias mapping and manifest

The manager never creates marker points or payload indexes. It refuses missing,
legacy, malformed, or mismatched target state. Alias and physical collection
names must be distinct.

## Controlled operator invocation

Run an approved, access-controlled Python operation using environment-backed
Qdrant configuration or an existing injected client. Do not put the Qdrant URL
or API key in source, logs, or command-line arguments. The following is an
illustrative composition; it is not an application startup hook:

```python
from qdrant_client import QdrantClient

from app.adapters.qdrant import QdrantAliasManager

client = QdrantClient(
    url=os.environ["QDRANT_URL"],
    api_key=os.environ.get("QDRANT_API_KEY"),
    check_compatibility=False,
)
manager = QdrantAliasManager(client)

result = manager.switch_alias(
    target_collection=target_manifest.physical_collection,
    alias_name=target_manifest.alias,
    expected_current_collection=recorded_current_collection,
    expected_manifest=target_manifest,
)

# Persist/return only result.as_dict(); it contains bounded manifest data and
# a manifest digest, never the marker payload or client credentials.
```

The operation reads the current alias, validates the target, then sends exactly
one Qdrant `update_collection_aliases` request. When an alias already exists,
the atomic request contains `DeleteAliasOperation` followed by
`CreateAliasOperation`; an initial switch contains only the create operation.
The operation is acknowledged only when Qdrant returns success and exact alias
readback points to the requested target.

## Explicit rollback

Rollback is a separate operator decision. It performs the same target
validation and requires an explicit current mapping; it does not run
automatically after a failed readback:

```python
result = manager.rollback_alias(
    alias_name=previous_manifest.alias,
    previous_collection=previous_manifest.physical_collection,
    expected_current_collection=observed_current_collection,
    expected_manifest=previous_manifest,
)
```

If readback fails, treat the result as unknown, inspect the alias through a
controlled operator channel, and invoke rollback only with a newly confirmed
`expected_current_collection`. Never retry by guessing the current mapping.
