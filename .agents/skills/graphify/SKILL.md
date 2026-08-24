---
name: graphify
description: Guide for querying and navigating the codebase using Graphify knowledge graph to optimize token usage and avoid redundant context reading.
---

# Graphify Knowledge Graph Skill

Use Graphify to navigate and explore the codebase efficiently with minimum token overhead.

## When to Use
- **Codebase Exploration**: When asking questions about project structure, relations, modules, dependencies, or architectural hubs.
- **Before File Reading**: Query Graphify first before doing broad grep searches or reading full multi-thousand-line source files.
- **Trace Relations**: When you need to understand how symbols, classes, or modules interact.

## Core Commands

### 1. Querying Concepts & Modules
```bash
# Query specific questions or entities
graphify query "<question or symbol>"
```

### 2. Finding Relationships & Call Paths
```bash
# Find shortest path between two modules/classes
graphify path "<SourceSymbol>" "<TargetSymbol>"
```

### 3. Explaining Specific Components
```bash
# Get focused subgraph for a specific concept/class
graphify explain "<SymbolOrConcept>"
```

### 4. Discovering Architectural Hubs
```bash
# List top architectural hubs (god-nodes)
graphify god-nodes --top 10
```

### 5. Keeping Graph Updated
```bash
# After modifying source code, update the graph (AST-only, 0 API token cost)
graphify update .
```

## Graphify Output Files
- `graphify-out/graph.json`: The complete knowledge graph (nodes, edges, communities).
- `graphify-out/.graphify_analysis.json`: Analysis and statistics metadata.
- `graphify-out/GRAPH_REPORT.md` (if generated): High-level architectural overview.
- `graphify-out/wiki/index.md` (if generated): Structured wiki documentation.
