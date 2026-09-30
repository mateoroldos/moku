# Skills

The project-owned [Moku skill](moku/SKILL.md) contains the engineering workflow
and focused references. Edit it with the code it describes.

Add upstream skills only for an active consumer. Inspect their instructions and
license, then use the pinned CLI from the repository root with a full commit SHA
in the tree URL:

```sh
bun run skills add <commit-pinned-tree-url> --skill <name> --agent universal
bun run skills remove <name> --agent universal
```

Commit installed bundles, [license notices](THIRD_PARTY_NOTICES), and `skills-lock.json`
together, then link the skill from its consumer's instructions. Keep upstream files
unchanged; local policy belongs in the Moku skill. Remove bundles and reading
links when their consumers disappear. `skills check` can write files; use
`bun run check:guidance` for read-only metadata and local-link validation.

Claude Code discovers skills only in `.claude/skills`, a committed symlink to this
directory. Add a link only for another harness in use.
