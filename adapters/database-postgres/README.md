# PostgreSQL persistence

Implements `HumanTaskStore` with Drizzle and Effect SQL. Supply the PostgreSQL
client with `PersistencePostgres.typeParsers` for Drizzle's temporal codecs.

## Develop

Follow the root [database setup](../../README.md#develop). Run the commands below
from the repository root.

Compose exposes PostgreSQL 17 on `127.0.0.1:54329`, with development-only `moku`
credentials and a persistent named volume. `db:down` stops the service and retains
the volume. The migration command reads root `.env`; an exported `DATABASE_URL`
overrides it. For Neon, use a direct connection URL for migrations and preserve
the provider's TLS settings.

## Change the schema

```sh
bun run db:generate
bun run db:check
bun run db:migrate
```

Edit [the task schema](src/human-task/schema.ts), generate and review the SQL, and commit
the migration directory including its snapshot. Add a new migration rather than
editing one already applied to a database. `db:check` generates against a
temporary copy and fails on drift. Apply checked-in migrations once per deployment
before serving traffic; repeated migration runs leave applied migrations intact.

Generate [the auth schema](src/auth/schema.ts) with Better Auth rather than editing
it by hand. Web owns [Better Auth options](../../apps/web/src/lib/server/better-auth-options.ts)
and [the CLI entrypoint](../../apps/web/auth.config.ts). Run
`bun run --cwd apps/web auth:generate` before `db:generate`.
`db:check` also regenerates the Better Auth schema in a temporary directory and
rejects differences from the checked-in schema.
The generation config uses a mock Drizzle client and never connects to a database.

## Verify

`bun run check` includes migrated PGlite tests. For real driver, reconnection, and
competing-write tests, point the separate command at a **disposable test database**:

```sh
docker compose exec postgres createdb -U moku moku_test
TEST_DATABASE_URL=postgresql://moku:moku@127.0.0.1:54329/moku_test bun run test:postgres
```

The suite applies migrations and removes its own fixed test tasks before and after
each scenario. CI provides a dedicated PostgreSQL service. PGlite remains test-only;
it does not establish production multi-connection behavior.
