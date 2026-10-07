# PostgreSQL persistence

Implements `HumanTaskStore` and `OrganizationMembershipStore` with Drizzle
and Effect SQL. Supply the PostgreSQL
client with `PersistencePostgres.typeParsers` for Drizzle's temporal codecs.

The web runtime uses `PostgresConnection.layer` to supply Effect SQL and
`AuthStorage.Service` from one scoped pool. Auth storage is a Better Auth database
factory; it does not expose the raw pool or Drizzle clients. Sharing a pool does
not share transactions: task permissions and writes must use the same Effect SQL
transaction, rather than mixing in Better Auth writes.

`OrganizationMembershipStore.withLock` owns the transaction that holds membership
stable while its callback runs. Task-store writes in that callback use the same
Effect SQL client and roll back if the callback fails or is interrupted.

## Develop

Follow the root [database setup](../../README.md#develop). Run the commands below
from the repository root.

Compose exposes PostgreSQL 17 on `127.0.0.1:54329`, with development-only `moku`
credentials and a persistent named volume. `db:down` stops the service and retains
the volume. The migration command reads root `.env`; an exported `DATABASE_URL`
overrides it. For Neon, use a direct connection URL for migrations and preserve
the provider's TLS settings.

### Reset local data

Stop the app. These commands delete all data in the local Compose database:

```sh
docker compose down -v
bun run db:up
bun run db:migrate
```

Repeat [account and task seeding](../../README.md#develop) before restarting the app.

For a non-Compose development database, recreate the disposable database before
running migrations and seeds.

## Change the schema

```sh
bun run db:generate
bun run db:check
bun run db:migrate
```

Edit [the task schema](src/human-task/schema.ts), generate and review the SQL, and commit
the migration directory including its snapshot. Add a migration rather than editing
one already applied. Disposable baselines follow the root
[development status policy](../../AGENTS.md#development-status).
`db:check` generates against a temporary copy and fails on drift. Apply checked-in migrations once per deployment
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
