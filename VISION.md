# Vision

**Moku is the open-source human interface layer for AI agents.**

Agents describe the work and the decision. Moku renders the right human review
experience, without developers building a custom frontend for every workflow.

The initial focus is the moments when an agent needs a human to understand,
verify, compare, edit, or decide. Frameworks own execution; Moku owns the human
review experience.

## Scope

One primitive, `HumanTask`, describes:

- **Intent:** the judgment required, such as authorizing an action or selecting alternatives.
- **Subject:** the action, alternatives, or artifact being reviewed.
- **Supporting information:** relevant context, consequences, and evidence.
- **Response specification:** what constitutes a valid answer.

The submitted result is distinct from the response specification. It can combine
a decision, selections, edited content, and feedback. Moku validates the result
against the requested response.

Opinionated presets produce compatible intent, subject, and response specifications.
Semantic composition supports more complex requests. Agents describe information
and decisions, not component trees or page layouts; Moku owns presentation.

## Initial review experiences

Three examples guide the first version without defining industry-specific task types:

| Judgment  | Example                | Review experience                                                                                    |
| --------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Authority | Paper-trading proposal | Inspect the proposed action, exposure changes, risks, and evidence; approve or reject with feedback. |
| Selection | Candidate shortlist    | Compare job-relevant attributes and evidence; select alternatives and provide feedback.              |
| Quality   | Weekly business report | Review and edit the artifact; authorize publication or request changes.                              |

The subject should dominate the page. Keep decision-critical evidence and
consequences visible; progressively disclose supporting detail, extended reasoning,
and history. Help humans verify claims rather than rubber-stamp confidence scores.

A small pending/completed inbox supports the review pages. External reviewers are
a first-class audience: teammates, clients, and customers should be able to review
a task from a shared link. A link's reachability does not establish permission;
reviewer identity and access rules must be agreed before implementing sharing.

## Integration boundary

HTTP and MCP are the intended framework-neutral interfaces. Task creation stores
the request and returns an ID without waiting for a human. The calling system owns
waiting, retrieving the result, resuming, and executing the resulting action.

A recorded decision is not an executed action: approval to publish does not mean
the report has been published. Moku is not an agent runtime, workflow engine,
generic form builder, or observability platform.

## Principles

- Simple cases should require almost no configuration; complex cases should not
  require leaving Moku. Grow semantic primitives and presentation rules from real
  review experiences, rather than building a general rendering engine upfront.
- Stay framework-agnostic, interoperable, and small enough for a solo maintainer.
- Make the open-source product genuinely useful when self-hosted, including basic
  external review and its access controls. Managed hosting can charge for operational
  convenience and advanced collaboration without withholding the core experience.

## Future direction

Let usage justify notifications, routing, audit history, custom renderers, and
eventually a broader human control layer for agents. Run or observability context
should support review, not define the product.

Decision history may inform operator-authored policies later. Repeated approvals
are not permission to stop asking. Any future policy evaluation needs explicit
ownership; frameworks remain responsible for execution and enforcing whether an
action may proceed.

## Signs of success

- Developers connect real agents and replace review interfaces they would otherwise build.
- Humans understand and complete tasks with little explanation.
- Developers share review links with teammates, clients, or customers.
- Users compose useful task shapes beyond the initial examples and reuse Moku across workflows.
- Requests for notifications, routing, teams, or audit history follow actual use.

GitHub stars alone are not validation. The strongest signal is developers choosing
Moku because its review experience is better than building their own.

## North Star

> Agent needs human → Moku appears → human responds → agent continues.
