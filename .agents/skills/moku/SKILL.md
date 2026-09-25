---
name: moku
description: Use when changing or reviewing Moku code, architecture, tests, documentation, or agent guidance.
---

# Moku

For documentation or skill work, follow [guidance maintenance](references/documentation.md).
For code changes, use the workflow below. During a review, trace the same boundaries
and report findings rather than implementing a change.

## 1. Locate the change

Read the affected local `AGENTS.md` files and follow the closest working example.
Identify the requested behavior, failure cases, and owners. Agree on scope before
editing when those choices are uncertain.

Ready when the entrypoint, dependencies, and public test seams are known.
Read [architecture](references/architecture.md) when changing their boundaries.

## 2. Build the smallest slice

Add only the layers the behavior needs. Keep policy with its owner and translate
external input and failures at the boundary. Follow [Effect conventions](references/effect.md)
for schemas, services, errors, and Layers.

Ready when the requested behavior and expected failures are handled, and affected
callers, composition, and local integration requirements are accounted for.

## 3. Verify and finish

Use [testing guidance](references/testing.md) to prove the changed behavior through
its public interface. Update the documentation that owns any changed rule or workflow.
Follow the root validation policy.

Done when each material behavior change has evidence or a reported gap, and the
handoff states what changed and which checks passed or failed.
