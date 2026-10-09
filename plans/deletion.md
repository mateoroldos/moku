# Delete accounts and organizations safely

Issue: #12

## Pull requests

| #   | Trunk gains                                     | Approach                                                                      | Done |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------- | ---- |
| 1   | Deleting an organization deletes its tasks      | `adapters/database-postgres/src/human-task/human-task-store-postgres.test.ts` |      |
| 2   | Owners delete an organization from its settings | design                                                                        |      |
| 3   | People delete their account with their password | design                                                                        |      |

## Design: PR 1

- Cascade on `human_tasks.organization_id`: one transaction with Better Auth's own deletion of members and invitations. Chosen.
- Delete tasks in `beforeDeleteOrganization`: Better Auth runs the hook outside its transaction, so a later failure leaves the organization without its tasks.
- Refuse deletion while tasks exist: owners can't delete an organization they used.

```diff
 POST /organization/delete → Better Auth deleteOrganization
   └─ transaction: delete member, invitation, organization
-       └─ human_tasks rows exist → foreign key violation → 500
+       └─ ON DELETE CASCADE removes the organization's human_tasks
```

`adapters/database-postgres/src/human-task/schema.ts` gains `{ onDelete: "cascade" }`; the regenerated baseline holds it.

| Test                                       | Level                                                   | Fails if                                         |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------ |
| deleting an organization deletes its tasks | PGlite store test, which runs the production migrations | the cascade is dropped or a migration reverts it |

Sources: `better-auth@1.7.4` `plugins/organization/adapter.mjs` (`deleteOrganization`), `routes/crud-org.mjs` (hooks outside the transaction); `adapters/database-postgres/README.md#change-the-schema`.
