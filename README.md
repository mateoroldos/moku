# Moku

**The open-source human interface layer for AI agents.**

Approve actions. Compare options. Review outputs. Without building another frontend.

Agents describe the work and the decision. Moku is designed to turn those semantic
requests into subject-focused review experiences and return structured results.
Frameworks own execution; Moku owns presentation. HTTP and MCP are the intended
integration interfaces.

Read the [vision](VISION.md) for the product's purpose, scope, and priorities.

## Develop

Based on [Effect Forge](https://github.com/mateoroldos/effect-forge). The SvelteKit
app currently previews the web shell and shared theme. Domain/core provide
create/read services; the preview is not connected to them yet.

Install [mise](https://mise.jdx.dev/getting-started.html), then from the repository root:

```sh
mise trust
mise run setup
bun run dev
```

Open `http://127.0.0.1:5173`.

```sh
bun run check
bun run build
```

`check` runs formatting, lint, guidance and workspace checks, Knip, typechecks,
and tests. Library packages export TypeScript source. `build` checks the web's
client/server bundles; a deployment adapter has not been selected yet.

- [Domain](packages/domain/src/human-task/human-task.ts): HumanTask schemas.
- [Core](packages/core/src/human-task/human-task-directory.ts): directory service and store port.
- [Web](apps/web/AGENTS.md) and [shared UI](packages/ui/AGENTS.md): frontend conventions.
- [Agent instructions](AGENTS.md) and [architecture](.agents/skills/moku/references/architecture.md).
