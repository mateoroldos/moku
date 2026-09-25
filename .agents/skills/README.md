# Skills

The project-owned [Moku skill](moku/SKILL.md) contains the engineering workflow
and focused references. Edit it with the code it describes.

Add upstream skills only for an active consumer. Inspect their instructions and
license, then use the pinned CLI from the repository root:

```sh
bun run skills add <commit-pinned-tree-url> --skill <name> --agent universal
bun run skills remove <name> --agent universal
```

Commit installed bundles, license notices, and `skills-lock.json` together. Keep
upstream files unchanged; local policy belongs in the Moku skill. Remove bundles
and reading links when their consumers disappear. `skills check` can write files;
use `bun run check:guidance` for read-only metadata and local-link validation.
