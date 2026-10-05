# Shared UI

This package owns feature-independent components and the shared visual vocabulary.
Add primitives when a consuming page needs them.

- Reuse `src/theme.css` tokens and existing component variants. Application state,
  remote functions, and permissions belong to consumers.
- Preserve labels, keyboard/focus behavior, and disabled states when adapting a
  component. Follow installed library APIs and neighboring components.
- `components.json` belongs to this package. Review generator output before
  accepting it; do not regenerate the collection for a targeted change.
- Keep shadcn components as generated unless the user explicitly requests a
  primitive edit. Customize through supported props, composition, theme tokens,
  and generator configuration. Report upstream defects instead of patching them
  silently; preserve generated APIs and component-family exports.
- Suppress approved upstream diagnostics with in-file comments. Keep generated
  components included in formatting and lint checks.
- `eslint.config.js` owns the Svelte and [design](../../DESIGN.md) lint rules that web
  reuses; Oxlint owns JavaScript/TypeScript rules.
- Use Phosphor icons with regular weight and direct `phosphor-svelte/lib/*` imports.
  Check generated components for icon dependencies before accepting them.

For component work, load [Svelte core practices](../../.agents/skills/svelte-core-bestpractices/SKILL.md)
and [shadcn-svelte](../../.agents/skills/shadcn-svelte/SKILL.md), and validate as in [web](../../apps/web/AGENTS.md). Run its CLI in this
package; local tokens, aliases, and icons override generic examples.

Follow [root validation](../../AGENTS.md#validation); use a consuming web page to
verify changed component behavior.
