# Moku

Read [VISION.md](VISION.md) for purpose and scope.
Use the [Moku workflow](.agents/skills/moku/SKILL.md) when changing this repository.

- For ownership or dependencies, read [architecture](.agents/skills/moku/references/architecture.md).
- Before editing documentation or skills, read [guidance maintenance](.agents/skills/moku/references/documentation.md).
- Before writing Effect code, read `node_modules/effect/AGENTS.md` completely and
  follow its relevant links. Use installed documentation and `node_modules/effect/src`
  to establish APIs; the project skill owns application conventions.

## Validation

Run the smallest checks justified by the change. Trivial cosmetic edits may need
no automated checks; judge the affected behavior, not the number of changed lines.
Run `bun run check` for broader changes or before landing. For documentation-only
changes, run `bun run check:guidance`. Build when compilation or bundling is affected.
Report what was checked, failures, and unverified behavior, or why checks were
skipped. Keep guidance accurate when its owning code changes.

## Development status

Moku is pre-release. All Moku development data is disposable. Changes may reset
development databases, replace migration baselines, and remove obsolete APIs or
compatibility code. Prefer a coherent current implementation over compatibility
with previous development versions.
