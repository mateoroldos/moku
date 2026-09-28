# PostgreSQL persistence

Implements `HumanTaskStore` with Drizzle and Effect SQL. The exported
`PersistencePostgres.layer` requires a PostgreSQL client; the application composition
root supplies it using `PersistencePostgres.typeParsers` for Drizzle's temporal
codecs. The same SQL works with local PostgreSQL or Neon.

## Develop

From the repository root, with Docker Compose installed:

```sh
cp .env.example .env
bun run db:up
bun run db:migrate
```

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

Edit [the schema](src/human-task/schema.ts), generate and review the SQL, and commit
the migration directory including its snapshot. `db:check` generates against a
temporary copy and fails on drift. Apply checked-in migrations once per deployment
before serving traffic; repeated migration runs leave applied migrations intact.

## Verify

`bun run check` includes migrated PGlite tests. For real driver, reconnection, and
competing-write tests, point the separate command at a **disposable test database**:

```sh
docker compose exec postgres createdb -U moku moku_test
TEST_DATABASE_URL=postgresql://moku:moku@127.0.0.1:54329/moku_test bun run test:postgres
```

The suite applies migrations and removes its own fixed test task before and after
the test. CI provides a dedicated PostgreSQL service. PGlite remains test-only;
it does not establish production multi-connection behavior.
