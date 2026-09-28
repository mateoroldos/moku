# Moku

**The open-source human interface layer for AI agents.**

Approve actions. Compare options. Review outputs. Without building another frontend.

Agents describe the work and the decision. Moku is designed to turn those semantic
requests into subject-focused review experiences and return structured results.
Frameworks own execution; Moku owns presentation. HTTP and MCP are the intended
integration interfaces.

Read the [vision](VISION.md) for the product's purpose, scope, and priorities.

## Develop

Based on [Effect Forge](https://github.com/mateoroldos/effect-forge). The SvelteKit
app currently previews the web shell and shared theme. Domain/core support creating,
reading, and completing approval tasks with structured results. A PostgreSQL
adapter provides durable storage; the web shell is not connected to these services
yet. PostgreSQL is provider-independent; Neon is the preferred managed provider.

Install [mise](https://mise.jdx.dev/getting-started.html), then from the repository root:

```sh
mise trust
mise run setup
bun run dev
```

Open `http://127.0.0.1:5173`.

For persistence development, install Docker with Compose, then from the root:

```sh
cp .env.example .env
bun run db:up
bun run db:migrate
```

See [PostgreSQL development](adapters/database-postgres/README.md) for migrations,
database tests, and connection configuration. The intended application host is
Node with composition in SvelteKit's server layer; that integration is next.

```sh
bun run check
bun run build
```

`check` runs formatting, lint, guidance, workspace and migration checks, Knip, typechecks,
and tests. Library packages export TypeScript source. `build` checks the web's
client/server bundles; the Node deployment adapter is not configured yet.

- [Domain](packages/domain/src/human-task/human-task.ts): HumanTask schemas.
- [Core](packages/core/src/human-task/human-task-directory.ts): directory service and store port.
- [PostgreSQL](adapters/database-postgres/README.md): persistence adapter and migrations.
- [Web](apps/web/AGENTS.md) and [shared UI](packages/ui/AGENTS.md): frontend conventions.
- [Agent instructions](AGENTS.md) and [architecture](.agents/skills/moku/references/architecture.md).
