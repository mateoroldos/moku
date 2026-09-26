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

Follow [root validation](../../AGENTS.md#validation). Choose the smallest relevant
browser check; trivial cosmetic edits may only need a quick visual inspection.
Run broader regression checks when shared behavior or a discovered failure warrants
them. Report browser checks separately from automated checks.
