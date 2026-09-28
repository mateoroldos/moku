# Architecture

| Workspace                    | Owns                                                     | Internal dependencies |
| ---------------------------- | -------------------------------------------------------- | --------------------- |
| `packages/domain`            | Shared values, schemas, and domain decisions             | None                  |
| `packages/core`              | Application policy, operation inputs, and required ports | Domain                |
| `packages/ui`                | Shared Svelte components and visual vocabulary           | None                  |
| `adapters/database-postgres` | PostgreSQL persistence and migrations                    | Core, domain          |
| `apps/web`                   | Routes, rendering, and browser interactions              | UI                    |

Domain and core stay independent of frameworks, SQL, and provider SDKs.
Core owns domain-shaped ports and their expected failures. Adapters translate
technology into those contracts; entrypoints choose implementations.

As the [review model](../../../../VISION.md#scope) is implemented, domain owns
semantic task and response contracts; core owns response validation policy and
lifecycle rules. Web owns presentation and task-specific rendering; shared UI
owns feature-independent primitives. Agent integrations leave waiting, resuming,
and execution with the calling system. The dependency table describes current
package access, not planned integrations.

[Workspace rules](../../../../tools/architecture/workspaces.ts) are the source of
truth for package names, locations, and allowed dependencies. Update them with
workspace changes. `check:workspaces` validates manifests; Oxlint checks imports,
including relative paths. Neither proves correct Layer placement or port design.
