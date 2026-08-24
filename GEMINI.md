# Repository Guidelines

This repository uses **Graphify** for token-efficient codebase navigation and structured skills in `.agents/skills/`.

## Mandatory Rules:
1. **Graphify First**: For architecture or code exploration, always query the knowledge graph in `graphify-out/` (`graphify query`, `graphify explain`, `graphify path`) instead of loading full source files.
2. **Sync Graph**: Run `graphify update .` after making code changes to keep AST indices up to date.
3. **Use Skills**: Consult skills in `.agents/skills/` (`graphify`, `backend`, `frontend`, `design-system`) for domain-specific implementation rules.
