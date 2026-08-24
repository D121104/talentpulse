# Repository Agent Guidelines & Standards

This repository contains a full-stack recruitment & job-matching ecosystem with NestJS/PostgreSQL backend, mobile/web frontends, and AI matching.

---

## 1. MANDATORY: Graphify-First Codebase Exploration (Token Optimization)

To minimize token usage and avoid redundant full-file scans:
- **Always consult Graphify first** before broad grep searches or reading large source files.
- When `graphify-out/graph.json` exists:
  - **Query concepts/symbols**: Run `graphify query "<question or symbol>"`
  - **Trace relationships/calls**: Run `graphify path "<Source>" "<Target>"`
  - **Explain components**: Run `graphify explain "<ConceptOrClass>"`
  - **Check hubs**: Run `graphify god-nodes --top 10`
- **After code changes**: Run `graphify update .` to update AST indices without any LLM token costs.

---

## 2. Workspace Skills Catalog

The project contains specialized skills located in `.agents/skills/`:

| Skill | Path | Purpose |
| :--- | :--- | :--- |
| **`graphify`** | [.agents/skills/graphify/SKILL.md](file:///.agents/skills/graphify/SKILL.md) | Graphify knowledge graph query and navigation instructions. |
| **`backend`** | [.agents/skills/backend/SKILL.md](file:///.agents/skills/backend/SKILL.md) | NestJS, TypeORM, PostgreSQL, Redis, Elasticsearch patterns. |
| **`frontend`** | [.agents/skills/frontend/SKILL.md](file:///.agents/skills/frontend/SKILL.md) | Mobile and web frontend architecture, state management, API integration. |
| **`design-system`** | [.agents/skills/design-system/SKILL.md](file:///.agents/skills/design-system/SKILL.md) | UI/UX aesthetic rules, color tokens, typography, animations. |

---

## 3. General Development Rules

- **Code Quality**: Ensure zero TypeScript errors (`npm run build`) and clean formatting (`npm run lint`).
- **Data Integrity**: Preserve UUID `_id` structure for entity contracts and soft deletion with `deletedAt`/`isDeleted`.
- **Infrastructure**: Use the multi-service Docker Compose stack located in `backend/environment/docker-compose.yml`.
