# Moku

Read [VISION.md](VISION.md) for purpose and scope.
Use the [Moku workflow](.agents/skills/moku/SKILL.md) when changing this repository.

- For ownership or dependencies, read [architecture](.agents/skills/moku/references/architecture.md).
- Before editing documentation or skills, read [guidance maintenance](.agents/skills/moku/references/documentation.md).
- Before writing Effect code, read `node_modules/effect/AGENTS.md` completely and
  follow its relevant links. Use installed documentation and `node_modules/effect/src`
  to establish APIs; the project skill owns application conventions.

## Validation

Run focused checks while working; finish with `bun run check`.
Packages export TypeScript source, so there is no build step yet.
Report commands, failures, and unverified behavior. Keep guidance accurate when
its owning code changes.
