# Documentation and skills

## Decide whether to edit

Edit guidance only for a requested documentation task, to correct inaccurate guidance,
or to close a demonstrated gap that matters beyond the current task.

- Identify the reader's task and the missing decision or instruction before adding text.
- Prefer correcting, replacing, or removing existing text over appending another rule.
- Keep implementation-specific explanations beside code or configuration. Promote them
  to shared guidance only when they govern work across boundaries.
- Keep change summaries, validation results, and one-off discoveries in the commit or
  handoff unless future work requires them.
- Add a document or skill only when an existing owner cannot serve the distinct task clearly.

## Own it

| Content                                   | Home                                               |
| ----------------------------------------- | -------------------------------------------------- |
| Purpose and priorities                    | `VISION.md`                                        |
| Starting points                           | `README.md`                                        |
| Shared constraints and routing            | Root `AGENTS.md` and project skill                 |
| Boundary contracts, tools, and procedures | Owning area's instructions, docs, or skills        |
| Independently discoverable agent workflow | `SKILL.md`, with a trigger and completion criteria |
| Lookup detail                             | Guide or skill reference                           |
| Implementation examples                   | Source/tests; walkthroughs explain decisions       |

Shared guidance owns cross-boundary contracts. Each boundary owns its technology,
implementation conventions, and verification. Route to that owner instead of
pulling its framework or provider rules into the root workflow. Keep one full
definition; short contextual recaps may link to it.
Co-locate implementation guides with their code, such as `apps/<app>/docs/`.
Repository-wide `docs/` serves cross-owner tasks and project entry paths.

## Make it discoverable

Start with shared constraints, then load the relevant owner, task guide or skill,
and supporting references. Name links by when to read them and what they provide.
Keep essential steps together; split only for a distinct task or owner.

A repeatable procedure can remain a guide. Add a skill when independent agent
selection adds value. Its entrypoint gives the workflow; conditional references
hold detail. Both humans and agents can use either. Root `.agents/skills/` is a
discovery location, not permission to define another boundary's policy.

## Write and maintain

- State prerequisites, working directory, actions, and visible success for procedures.
- Explain local decisions; link implementation details and upstream API references.
- Keep necessary context, cut generic advice, and label unverified workarounds with removal conditions.
- Adapt boundary guidance with its code; remove both together.
- Manage external skills through the [skill maintenance procedure](../../README.md).
  Owning areas select them and resolve conflicts with installed APIs and local policy.

## Verify

Check claims against source and update incoming links. Run `bun run check:guidance`
and root validation. The checker validates skill YAML metadata and first-party
local inline file links; it does not verify anchors, remote links, commands,
or procedural correctness. Check commands in their documented working directory.
