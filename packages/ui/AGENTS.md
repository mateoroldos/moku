# Shared UI

This package owns feature-independent components and the shared visual vocabulary.
Add primitives when a consuming page needs them.

- Reuse `src/theme.css` tokens and existing component variants. Application state,
  remote functions, and permissions belong to consumers.
- Preserve labels, keyboard/focus behavior, and disabled states when adapting a
  component. Follow installed library APIs and neighboring components.
- `components.json` belongs to this package. Review generator output before
  accepting it; do not regenerate the collection for a targeted change.
- Preserve generated component APIs. Resolve integration errors at their source;
  do not narrow props or rewrite primitives to satisfy a consuming page.
- `eslint.config.js` owns the Svelte and [design](../../DESIGN.md) lint rules that web
  reuses; Oxlint owns JavaScript/TypeScript rules.
- Use Phosphor icons with regular weight and direct `phosphor-svelte/lib/*` imports.
  Check generated components for icon dependencies before accepting them.

For component work, load [Svelte core practices](../../.agents/skills/svelte-core-bestpractices/SKILL.md)
and [shadcn-svelte](../../.agents/skills/shadcn-svelte/SKILL.md), and validate as in [web](../../apps/web/AGENTS.md). Run its CLI in this
package; local tokens, aliases, and icons override generic examples.

Follow [root validation](../../AGENTS.md#validation); use a consuming web page to
verify changed component behavior.
