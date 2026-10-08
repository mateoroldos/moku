# Architecture

| Workspace                    | Owns                                                     | Internal dependencies                           |
| ---------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `packages/domain`            | Shared values, schemas, and domain decisions             | None                                            |
| `packages/core`              | Application policy, operation inputs, and required ports | Domain                                          |
| `packages/ui`                | Shared Svelte components and visual vocabulary           | None                                            |
| `adapters/database-postgres` | PostgreSQL persistence and migrations                    | Core, domain                                    |
| `adapters/email-cloudflare`  | Cloudflare email delivery                                | Core                                            |
| `apps/web`                   | Server composition, routes, and browser interactions     | UI, domain, core, PostgreSQL and email adapters |

Domain and core stay independent of frameworks, SQL, and provider SDKs.
Core owns domain-shaped ports and their expected failures. Adapters translate
technology into those contracts; entrypoints choose implementations.

Place values in domain when their meaning belongs to the business model independently
of a particular operation. Keep operation-specific read projections in core beside
their ports. Choose ownership by meaning and reason to change, not by where data is
loaded or whether it uses Schema.

Core application operations own their role policy and the reads or writes they
authorize, scoped to a resolved `Membership` they receive. Web resolves identity
and membership and translates operation results to HTTP; it must not assemble an
operation's authorization and persistence sequence.

Better Auth implements account, session, organization, and membership management
under Moku's configured policies. Web reaches it on the server through services that
`AuthProvider` builds from its Better Auth instance; remote functions call them.
Cookie-handling account flows, including signout, use the browser client.
Core never calls Better Auth.

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
