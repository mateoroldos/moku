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
adapter provides durable storage. The Node server composes these services, while
the review UI remains a static shell. PostgreSQL is provider-independent; Neon is
the preferred managed provider.

Install [mise](https://mise.jdx.dev/getting-started.html), then from the repository root:

```sh
mise trust
mise run setup
```

Before starting the server, install Docker with Compose and prepare the database
from the root:

```sh
cp .env.example .env
bun run db:up
bun run db:migrate
```

Then run `bun run dev` and open `http://127.0.0.1:5173`. Both development and the
built server use Node 24 and read root `.env`; exported variables take precedence.

See [PostgreSQL development](adapters/database-postgres/README.md) for migrations,
database tests, and connection configuration.

## Built server

```sh
ORIGIN=http://127.0.0.1:3000 bun run build
HOST=127.0.0.1 bun run start
```

Set `ORIGIN` to the public URL **at build time**; the pinned Kit 3 adapter uses
`paths.origin`, rather than the Kit 2 runtime `ORIGIN` setting. `DATABASE_URL` is
read at server startup; building needs no database connection. Apply migrations
explicitly before starting each deployment. `HOST` and `PORT` configure the listener
(defaults: `0.0.0.0:3000`). Send SIGTERM/SIGINT for graceful shutdown.

The build lives in `apps/web/build` and requires installed production dependencies.

## Verify

```sh
bun run check
bun run build
```

`check` runs formatting, lint, guidance, workspace and migration checks, Knip, typechecks,
and tests. `test:postgres` additionally verifies the real database adapter and web
runtime against a migrated disposable database. Library packages export TypeScript
source; the Node build bundles internal packages into the server output.

- [Domain](packages/domain/src/human-task/human-task.ts): HumanTask schemas.
- [Core](packages/core/src/human-task/human-task-directory.ts): directory service and store port.
- [PostgreSQL](adapters/database-postgres/README.md): persistence adapter and migrations.
- [Web](apps/web/AGENTS.md) and [shared UI](packages/ui/AGENTS.md): frontend conventions.
- [Agent instructions](AGENTS.md) and [architecture](.agents/skills/moku/references/architecture.md).
