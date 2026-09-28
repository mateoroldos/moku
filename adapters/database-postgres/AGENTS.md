# PostgreSQL

Implement core persistence ports with Drizzle's Effect PostgreSQL integration.
Keep clients and provider types inside the adapter. Decode persisted rows through
domain schemas and translate SQL/decoding failures to the port's diagnostic errors.

- The composition root owns the PostgreSQL client/pool; exported persistence Layers
  leave that dependency open. Neon-specific provisioning does not belong here.
- Complete tasks with a conditional write. Preserve first-response-wins across
  independent connections; a prior application read cannot establish exclusivity.
- Follow the [migration workflow](README.md#change-the-schema); never migrate in a request.
- PGlite tests run the production store and migrations. Real PostgreSQL tests own
  driver and multi-connection behavior and run separately in CI.
- Keep Effect's drivers and platform packages on the same release. The root
  `platform-node-shared` override prevents its permissive range from pulling an
  incompatible prerelease into the migration CLI. Reassess the override when
  upgrading the Effect family together; remove it once dependency resolution
  produces compatible platform packages without it.

Follow the [root validation policy](../../AGENTS.md#validation).
