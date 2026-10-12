# Organization admins create and revoke API keys

Issue: #50

## Pull requests

| #   | Trunk gains                                                                                                                       | Approach                                                                                                                                            | Done |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `@better-auth/api-key` with organization-owned keys; `OrganizationApiKeys` create, list, and revoke services; no UI               | `apiKeyPlugin` beside `organizationPlugin` in `apps/web/src/lib/server/better-auth-options.ts`                                                      |      |
| 2   | API keys page: create dialog asks to name the key after its agent and shows the key once; table of name, prefix, last use; revoke | `apps/web/src/routes/(authenticated)/org/[organizationId]/team/+page.svelte`, `apps/web/src/lib/features/organizations/InviteTeammateDialog.svelte` |      |

## Decided

- `@better-auth/api-key@1.7.4`, pinned like the other Better Auth packages.
- Keys use `references: "organization"`: they belong to the organization, so they outlive the member who made them.
- Keys are deleted with their organization; `apiKeyPlugin` adds the foreign key the plugin omits.
- `revoke` takes only the key, like `cancelInvitation`: Better Auth checks the caller against the key's own organization.
- Creation stops at 100 keys, best-effort like the invitation cap, rather than paging: the plugin drops pagination before its query, so a key past 100 couldn't be listed or revoked.
- Keys record no creator; Better Auth's organization keys don't.
- Keys carry no task permissions: what a key may do with tasks is core policy, decided in #51.
- Verifying keys on requests and the key's principal in core belong to #51, not this issue.
