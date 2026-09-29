# Web

SvelteKit owns routes, rendering, and browser interactions. Keep remote
`query`/`form` functions with their feature and validate operation inputs with
Effect Schema.

- Reuse [shared UI](../../packages/ui/AGENTS.md) tokens and components.
- Follow the [review model](../../VISION.md#initial-review-experiences): center the
  subject and requested judgment. Render supported semantics, not agent-supplied
  component trees. Keep decision-critical evidence and consequences visible.
- Distinguish recorded decisions from executed actions. Show an action as completed
  only when its execution is confirmed, not merely because a human approved it.
- Keep feature state and navigation in the app. Prefer derived values to effects;
  use native events, snippets, semantic HTML, and visible keyboard focus.
- Keep compatible pinned Kit/Svelte/Vite versions together. Confirm
  prerelease APIs against installed sources/types before changing configuration.
- Adapter selection belongs to deployment composition. Discuss consequential
  runtime, persistence, or authentication changes before implementing them.
- The Node server owns one [Effect runtime](src/lib/server/runtime.ts) and PostgreSQL
  pool. [Server hooks](src/hooks.server.ts) bind request cancellation and dispose
  the runtime after adapter shutdown or development module replacement. Never
  dispose the shared runtime at the end of a request or apply migrations there.

- Run named application operations through `locals.run("Remote.<export>", program)`.
  The request runner owns cancellation, cause-preserving Result conversion, and
  operation observability; remotes must not pre-convert failures with `Effect.result`
  or duplicate operation logging. Single typed failures become Results; defects,
  interruption, and mixed causes reject with the full cause.
- Remote functions map typed failures to safe Kit errors after Effect execution.
  Forms keep validation inline and preserve input when a submission fails.
  Report locally caught unexpected errors; they do not reach Kit's error hooks.
- Publish authoritative mutation results to detail queries; secondary refresh failure
  does not undo a recorded decision. Failed submissions offer a native page reload
  to check persisted state; do not automatically retry writes.
- Use Kit query overrides for optimistic review presentation. Keep unconfirmed variants
  in the feature's view type, not domain state. Forms own fields, pending, and validation;
  use normal query/error boundaries rather than a separate reconciliation workflow.
- Root error pages handle generic route failures; feature boundaries own task-specific
  recovery. Offer same-page reload for transient failures and an exit for missing resources.

Follow [root validation](../../AGENTS.md#validation). Choose the smallest relevant
browser check; trivial cosmetic edits may only need a quick visual inspection.
Run broader regression checks when shared behavior or a discovered failure warrants
them. Report browser checks separately from automated checks.
