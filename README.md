# Moku

**The open-source human interface layer for AI agents.**

Approve actions. Compare options. Review outputs. Without building another frontend.

Agents describe the work and the decision. Moku is designed to turn those semantic
requests into subject-focused review experiences and return structured results.
Frameworks own execution; Moku owns presentation. HTTP and MCP are the intended
integration interfaces.

Read the [vision](VISION.md) for the product's purpose, scope, and priorities.

## Develop

Domain/core foundation based on [Effect Forge](https://github.com/mateoroldos/effect-forge).
Create/read services and tests are available; there is no application yet.

Install [mise](https://mise.jdx.dev/getting-started.html), then from the repository root:

```sh
mise trust
mise run setup
bun run check
```

`check` runs formatting, lint, guidance and workspace checks, Knip, typechecks,
and tests. Packages export TypeScript source; there is no build step.

- [Domain](packages/domain/src/human-task/human-task.ts): HumanTask schemas.
- [Core](packages/core/src/human-task/human-task-directory.ts): directory service and store port.
- [Agent instructions](AGENTS.md) and [architecture](.agents/skills/moku/references/architecture.md).
