# Shared UI

This package owns feature-independent components and the shared visual vocabulary.
Add primitives when a consuming page needs them.

- Reuse `src/theme.css` tokens and existing component variants. Application state,
  remote functions, and permissions belong to consumers.
- Preserve labels, keyboard/focus behavior, and disabled states when adapting a
  component. Follow installed library APIs and neighboring components.
- `components.json` belongs to this package. Review generator output before
  accepting it; do not regenerate the collection for a targeted change.
- Use Phosphor icons with regular weight and direct `phosphor-svelte/lib/*` imports.
  Check generated components for icon dependencies before accepting them.

Follow [root validation](../../AGENTS.md#validation); use a consuming web page to
verify changed component behavior.
