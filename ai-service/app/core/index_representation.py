from __future__ import annotations

# These values describe the serialized representation stored in the job index.
# Changing one requires a new collection/backfill rather than mixing vectors.
NORMALIZATION_VERSION = "nfkc-html-whitespace-v1"
CHUNKING_VERSION = "section-greedy-v1"
INDEX_SCHEMA_VERSION = "job-index-v1"
