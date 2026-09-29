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
  The [request runner](src/lib/server/request-runner.ts) owns cancellation,
  operation observability, and conversion to Results; remotes map typed failures
  to safe Kit errors afterward.
- Keep validation inline and preserve form input on submission failure.
  Report locally caught unexpected errors; they bypass Kit's error hooks.
  Route error boundaries own failures that replace the page.
- Publish authoritative mutation results to detail queries. Secondary refresh
  failures must not undo confirmed mutations.
- Use Kit query overrides for optimistic presentation and keep temporary variants
  in feature view types. Kit owns form fields, pending state, and validation.

Follow [root validation](../../AGENTS.md#validation). Choose the smallest relevant
browser check; trivial cosmetic edits may only need a quick visual inspection.
Run broader regression checks when shared behavior or a discovered failure warrants
them. Report browser checks separately from automated checks.
