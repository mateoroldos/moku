# Moku

**The open-source human interface layer for AI agents.**

Approve actions. Compare options. Review outputs. Without building another frontend.

Agents describe the work and the decision. Moku is designed to turn those semantic
requests into subject-focused review experiences and return structured results.
Frameworks own execution; Moku owns presentation. HTTP and MCP are the intended
integration interfaces.

Read the [vision](VISION.md) for the product's purpose, scope, and priorities.

## Develop

Based on [Effect Forge](https://github.com/mateoroldos/effect-forge). Domain/core
support creating, reading, and completing approval tasks with structured results.
The web app provides an organization inbox and individual review pages.
PostgreSQL provides durable storage; Neon is the preferred managed provider.

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

Set `BETTER_AUTH_SECRET` in `.env` to a private value from `openssl rand -base64 32`.
Create a verified reviewer account, organization, and example tasks from the root:

```sh
SEED_EMAIL=reviewer@example.com SEED_PASSWORD='<private password>' bun run db:seed
```

The seed creates an owner membership in the `moku` organization; set
`SEED_ORGANIZATION_SLUG` to seed another organization. Repeated seeds preserve
existing credentials and memberships. Public signup and membership endpoints are disabled.

To provision only the account and organization:

```sh
SEED_EMAIL=reviewer@example.com SEED_PASSWORD='<private password>' bun run auth:seed
```

Each `db:seed` run adds four tasks and prints review URLs. Set `REVIEW_BASE_URL`
for a server other than `http://127.0.0.1:5173`. Provisioning and task creation commit
separately; a failed run can leave an account, organization, or partial task batch.

Run `bun run dev` and open `http://127.0.0.1:5173`. Development commands and the
built server read root `.env`; exported variables take precedence.

See [authentication boundaries](apps/web/docs/authentication.md) when changing access checks.

See [PostgreSQL development](adapters/database-postgres/README.md) for migrations,
database tests, and connection configuration.

### Local traces

Start the local OTLP viewer in a separate terminal (Docker required):

```sh
docker run --rm -p 127.0.0.1:8000:8000 -p 127.0.0.1:4318:4318 \
  ghcr.io/ctrlspice/otel-desktop-viewer:v0.5.0 --host 0.0.0.0 --open-browser=false
```

Run `bun run dev:otel` from the repository root and use the app. View traces at
`http://localhost:8000` under `moku.web`. Normal development needs no collector.

## Built server

```sh
ORIGIN=http://127.0.0.1:3000 bun run build
ORIGIN=http://127.0.0.1:3000 HOST=127.0.0.1 bun run start
```

Set `ORIGIN` to the exact browser origin **at build time and startup**. Kit 3 embeds
`paths.origin` in the build; authentication reads `ORIGIN` at startup. Use HTTPS
except on loopback hosts. `DATABASE_URL` and `BETTER_AUTH_SECRET` are read at server
startup; building needs no database connection or auth secret. Apply migrations
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
runtime and authentication against a migrated disposable database. Library packages
export TypeScript source; the Node build bundles internal packages into the server output.

- [Domain](packages/domain/src/human-task/human-task.ts): HumanTask schemas.
- [Core](packages/core/src/human-task/human-task-directory.ts): directory service and store port.
- [PostgreSQL](adapters/database-postgres/README.md): persistence adapter and migrations.
- [Web](apps/web/AGENTS.md) and [shared UI](packages/ui/AGENTS.md): frontend conventions.
- [Agent instructions](AGENTS.md) and [architecture](.agents/skills/moku/references/architecture.md).
