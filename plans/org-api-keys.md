# Organization admins create and revoke API keys

Issue: #50

## Pull requests

| #   | Trunk gains                                                                                                                                | Approach                                                                                                                                            | Done |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `@better-auth/api-key` with organization-owned keys; `OrganizationApiKeys` create, list, and revoke services; no UI                        | design                                                                                                                                              |      |
| 2   | API keys page: create dialog asks to name the key after its agent and shows the key once; table of name, prefix, creator, last use; revoke | `apps/web/src/routes/(authenticated)/org/[organizationId]/team/+page.svelte`, `apps/web/src/lib/features/organizations/InviteTeammateDialog.svelte` |      |

## Design: PR 1

Alternatives:

- **Better Auth `@better-auth/api-key` with `references: "organization"`** (chosen): one plugin, one table, hashing, generation, and org-scoped permission checks built in; costs two small extensions (creator in metadata, cascade on organization delete).
- Moku-owned key table: full control over creator and cascade; costs our own generation, hashing, verification, and revoke code beside Better Auth.
- Better Auth bearer or JWT: these identify users, not organizations; keys would break when their creator leaves.

Plugin configuration, in `better-auth-options.ts` beside `organizationPlugin`:

```ts
apiKey({
  references: "organization", // a key belongs to the organization, not its creator
  defaultPrefix: "moku_",
  enableMetadata: true, // { createdBy: UserId }, set on the server from the session
  rateLimit: { enabled: false }, // default allows 10 requests per day
  permissions: { defaultPermissions: { task: ["create", "read"] } },
});
```

- Owners and admins gain `apiKey: ["create", "read", "delete"]` in `organizationRoles`, so UI capabilities can derive from it; members and viewers gain nothing.
- The schema override adds `referenceId → organization.id` with `onDelete: "cascade"`, as `organizationPlugin` overrides `member`.

```diff
 OrganizationApiKeys.create(headers, organizationId, createdBy, input): Effect<CreatedApiKey, NotFound | Denied | KeyLimit | Unavailable>
+  ├─ list(headers, organizationId) → 100 keys → KeyLimit
+  └─ auth.api.createApiKey({ headers, body: { organizationId, name, metadata: { createdBy } } })
+       └─ caller lacks apiKey:create → Denied
 OrganizationApiKeys.list(headers, organizationId): Effect<ReadonlyArray<ApiKey>, NotFound | Denied | Unavailable>
+  └─ auth.api.listApiKeys({ headers, query: { organizationId } })
 OrganizationApiKeys.revoke(headers, keyId): Effect<void, Denied | NotFound | Unavailable>
+  └─ auth.api.deleteApiKey({ headers, body: { keyId } })
```

`CreatedApiKey` carries the plaintext key once; `ApiKey` never does.

| Test                                                        | Level                 | Fails if                                                  |
| ----------------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| admin creates, lists, and revokes a key                     | integration, Postgres | the service or plugin wiring breaks                       |
| member and viewer cannot create or list keys                | integration           | role statements leak `apiKey`                             |
| list returns every key of the organization, none of another | integration           | keys leak across organizations                            |
| stored key is hashed and summaries omit it                  | integration           | the plaintext key is persisted or returned                |
| deleting an organization deletes its keys                   | integration, Postgres | the cascade is missing                                    |
| creation stops at 100 keys                                  | integration, Postgres | a key past Better Auth's 100-row list becomes unrevocable |

Sources: `apps/web/src/lib/server/better-auth-options.ts` (`organizationPlugin` schema override), `apps/web/src/lib/server/organizations.ts` (service shape), `@better-auth/api-key@1.7.4` `dist/index.mjs`, Better Auth v1.7.4 `docs/content/docs/plugins/api-key/advanced.mdx`.

## Decided

- `@better-auth/api-key@1.7.4`, pinned like the other Better Auth packages.
- `revoke` takes only the key, like `cancelInvitation`: Better Auth checks the caller against the key's own organization.
- Creation stops at 100 keys, best-effort like the invitation cap, rather than paging: the plugin drops pagination before its query, so a key past 100 couldn't be listed or revoked.
- `create` takes `createdBy` from the caller's resolved principal, like other request context.
- Verifying keys on requests and the key's principal in core belong to #51, not this issue.
