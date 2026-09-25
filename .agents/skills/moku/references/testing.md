# Testing

Test through the public interface that owns the behavior. Assert results, failures,
state changes, or resource cleanup rather than private calls.

## Choose the seam

- Domain tests prove valid values and decisions.
- Service tests prove policy and workflows with substitute capabilities.
- Adapter tests prove translation and integration behavior.
- Entrypoint tests prove public protocol or interaction behavior.

Keep each assertion with its owner. A service test does not prove a browser flow;
a local database test does not prove a deployed connection. Local instructions
describe the available integration fixtures and manual checks.

## Dependencies and time

Provide substitute Layers instead of mocking modules. A reusable substitute must
honor the port contract. Run shared contract tests when multiple adapters implement it.

Use Effect test clocks and deterministic services for time and randomness. Signal
concurrent progress explicitly rather than sleeping. Keep fixtures in the narrowest
scope that provides useful reuse:

- `Effect.provide` for dependencies local to a test.
- `layer` for a shared scoped fixture without state leakage.
- `it.layer` for independently built nested scenarios.

## Properties

Use `it.effect.prop` when an invariant covers a meaningful input space. Supply
schemas for valid values or `FastCheck` from `effect/testing` for custom generators.
Keep named examples for important failures and regressions.

Useful properties compare independent operations or check a result invariant,
such as round trips or idempotence. Generating from a schema and checking that the
same schema accepts the result proves little.

Finish with the [root validation policy](../../../../AGENTS.md#validation).
