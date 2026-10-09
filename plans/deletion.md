# Delete accounts and organizations safely

Issue: #12

## Pull requests

| #   | Trunk gains                                     | Approach                                                                      | Done   |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| 1   | Deleting an organization deletes its tasks      | `adapters/database-postgres/src/human-task/human-task-store-postgres.test.ts` | ✅ #42 |
| 2   | Owners delete an organization from Settings     | `apps/web/src/lib/features/organizations/MemberActions.svelte`                |        |
| 3   | People delete their account with their password | design                                                                        |        |

## Design: PR 2

- Settings page, shown to roles Better Auth lets delete: the conventional home for organization-wide actions. Chosen over a Team menu or the organization switcher.
- Typing the name confirms: the remote compares it with Better Auth's organization name and answers `invalid(issue.confirmation(…))`. Chosen over a plain dialog, since deletion takes every task with it.

```diff
+deleteOrganization form { organizationId, confirmation }
+  ├─ Organizations.list → not listed → redirect /     (gone already, or never a member)
+  │    └─ name ≠ confirmation → invalid(confirmation)
+  └─ Organizations.delete → auth.api.deleteOrganization → redirect /
+       ├─ USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION → Access.NotFound → redirect /
+       └─ YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION → Access.Denied → invalid
```

| Test                                                  | Level                               | Fails if                                                |
| ----------------------------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| deletes organizations under Better Auth's owner rules | real PostgreSQL through Better Auth | an error code maps to 503 instead of NotFound or Denied |

Sources: `better-auth@1.7.4` `plugins/organization/routes/crud-org.mjs` (`deleteOrganization`), `error-codes.mjs`; precedent `removeMember` in `apps/web/src/lib/server/auth-provider.ts`.

## Decided

- Cascade on `human_tasks.organization_id` over deleting tasks in `beforeDeleteOrganization`: Better Auth runs its hooks outside the transaction that deletes the organization.
