# Effect conventions

The installed Effect guide owns API mechanics. These are repository choices.

## Values and boundaries

- Parse untrusted input with `Schema` at entrypoints and in adapters; pass domain values inward.
- Use brands where mixing valid values would be a real mistake.
- Default records to `Schema.Struct` with a same-name interface. Use classes when their semantics are needed.
- Keep provider types out of domain and core. Introduce a separate wire schema only when its representation differs.

## Services and ports

Use `Context.Service` and `Layer`. Keep cohesive files together and use local role
names such as `Interface`, `Service`, and `layer`. Export one self-named module
namespace so callers can see the owner: `HumanTasks.Service`, for example.

Keep deterministic prerequisite checks as plain functions, even when they return
an Effect for typed failure. `Access.requireVerifiedEmail` checks the supplied
principal; it neither fetches identity nor needs an injectable service.

Acquire stable dependencies while building the service. Keep method requirements
empty unless a dependency truly varies per operation; callback-based operations
preserve the callback's requirements. Name effectful operations
with `Effect.fn`; add useful span attributes without logging private data.

Define the smallest domain-shaped port the workflow needs. A port exposes neither
driver clients nor provider errors. Do not add ports for anticipated integrations.

When correctness depends on holding a resource while work runs, prefer a capability
that owns that lifetime over marker services that callers must supply. For organization
writes, `OrganizationAccess.withWriteAccess` owns authorization and the membership
store's `withLock` owns the transaction and lock; ordinary reads use `require`.
Use direct checks for prerequisites and callbacks for resource lifetimes. Prefer
named capabilities over a generic authorization wrapper with transaction flags:
a transaction alone does not establish stable membership authorization.

## Failures

Use `Schema.TaggedError` for expected failures. The boundary that introduces a
failure owns it: ports own adapter failures; services own workflow failures.
Propagate an existing failure when wrapping it would add no meaning.

Retain technology failures as diagnostic causes. Entrypoints map typed failures to
safe public responses. Defects and interruptions remain defects and interruptions.

## Layers

Keep dependencies open when callers must choose them. Reuse Layer values for
memoization and use scoped resources for cleanup. A production-ready Layer may
close dependencies only when its package owns every nested implementation.

See [HumanTasks](../../../../packages/core/src/human-task/human-tasks.ts)
for the service pattern.
