# Development rules

This is a local-first Vue 3 / TypeScript application. Read `docs/ARCHITECTURE.md` for ownership, public entry points and persistence invariants.

- Keep changes incremental. Add layers only when they separate real responsibilities; do not replace the stack or introduce a backend for local features.
- Domain rules depend only on their own domain, the shared domain kernel and pure libraries. Keep Vue, Pinia, Dexie, DOM and network I/O outside domain/application.
- Use public files and dependency directions declared in `scripts/architecture/config.mjs`. Do not automatically whitelist violations. Keep UI/store entry points out of domain barrels and preserve lazy imports.
- `app` and `pages` compose features. `shared` and `src/domain` must not import features.
- Use typed repository operations instead of exposing learning tables to Vue. Preserve RAM, opt-in, serialized detached snapshots, CAS, budgets and atomic restore.
- A source-file relocation must not change database names/versions, store IDs, storage keys, schemas, migrations or exported data. Design an explicit migration for an intentional data change.
- Preserve offline static allowlists, explicit companion/AI consent and local processing. Do not introduce automatic persistence or background requests.
- Native Node companion runtime `.ts` imports need explicit extensions.
- Run `npm run check:quick` and relevant unit tests after meaningful implementation steps. Run browser checks for affected UI/persistence/offline flows. Before release, use `npm run check:full` with all three Playwright engines available.
- Report pre-existing failures separately from regressions. Never present an engine launch failure as a passed test or weaken business assertions just to make them green.
