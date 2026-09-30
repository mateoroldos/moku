# Design

Moku is a calm instrument for human judgment. The subject under review and the
requested decision are the loudest things on the page; chrome recedes. Reviewers
include teammates, clients, and customers arriving from shared links, so every page
must explain itself and earn trust. [VISION.md](VISION.md#initial-review-experiences)
owns what a review page contains; this file owns how it looks and behaves.

The signature is an instrument panel: machine values read like aligned instrument
readings, hairline rules rather than boxes separate them, and the decision area
reads as one control surface.

## Review experience

- Open with the subject and the requested judgment. Disclose supporting detail,
  extended reasoning, and history progressively.
- Place evidence beside the claim it supports. Present agent reasoning as checkable
  evidence; never lead with a confidence score.
- Show consequences—what changes, exposure, reversibility, who is affected—before
  the decision controls.
- Scale friction with stakes: a routine decision takes one step; an irreversible or
  high-exposure one requires explicit acknowledgement of its consequences.
- A recorded decision is not an executed action. Say "recorded", and show an action
  as completed only when its execution is confirmed.
- Every decision can be completed on a phone.

## Tokens

[`theme.css`](packages/ui/src/theme.css) is the only source of colors, fonts, and radii.
Use its semantic utilities (`bg-card`, `text-muted-foreground`) and Tailwind scales.
Add a token only when a design need has no existing role.

- `primary` (ember) marks the primary action, links, and focus, not decoration.
- `destructive` marks errors and destructive actions only.
- Separate regions with `border` and surface tokens before adding containers.

## Typography

| Family             | Role                                        |
| ------------------ | ------------------------------------------- |
| Newsreader (serif) | Page and subject titles                     |
| Inter (sans)       | Body, labels, controls                      |
| IBM Plex Mono      | Identifiers and code; never labels or prose |

Only weights 400 and 500 are loaded (serif: 400). Build hierarchy with size, color,
and spacing rather than bold. Set timestamps, counts, and compared figures in Inter
with `tabular-nums`.

## Layout

- Align related headings, content and controls to a shared gutter.
- Choose lists for scanning individual tasks and tables for multi-column comparison.
- Present the request before its decision controls. Keep supporting properties
  accessible on narrow screens without obscuring the subject.
- Density follows the judgment: reading-grade spacing for authority and quality
  reviews, compact aligned rows for selection and comparison.

## Components

Compose from [`@moku/ui`](packages/ui/AGENTS.md) primitives and their variants.
Keep decision controls together after the request. Use one primary action and a
visually secondary alternative. Menus use icons on every item or none.

## States

Design every state a surface can reach: empty, loading, pending, submitting,
recorded, already recorded, and failed. Loading placeholders match the final
layout. Pair every status color with text or an icon.

## Voice

- Use sentence case and plain verbs; cut filler.
- Name a control by its outcome and reuse that word in the result: Approve →
  Approval recorded.
- Errors say what happened and what to do next, without apology.
- Use the reviewer's vocabulary, never system internals.

## Motion

Use short ease-out transitions for state feedback everywhere. Reserve expressive
motion for key moments, such as a decision being recorded. Honor
`prefers-reduced-motion`.

## Don'ts

- No raw values: palette colors, hex, or arbitrary values. `bun run lint` enforces this.
- No decorative chrome: gradients, glows, glass, decorative shadows, or icons in tiles.
- No structure that encodes nothing: eyebrows, numbering, or dividers without meaning.
- No cards nested in cards.
- No second filled primary action in a view.
- No tooltips for information needed to decide.
- No decision actions outside the request page, such as in list menus.
