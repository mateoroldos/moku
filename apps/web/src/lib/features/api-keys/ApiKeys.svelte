<script lang="ts">
  import type { OrganizationId } from '@moku/domain/organization';
  import * as Table from '@moku/ui/ui/table';
  import { formatUtcDateTime } from '#lib/dates.ts';
  import ApiKeyActions from './ApiKeyActions.svelte';
  import { listApiKeys } from './api-keys.remote.ts';
  import CreateApiKeyDialog from './CreateApiKeyDialog.svelte';

  let { organizationId }: { organizationId: OrganizationId } = $props();

  const apiKeys = $derived(await listApiKeys(organizationId));
</script>

<section aria-labelledby="api-keys" class="flex flex-col gap-4 border-t pt-6">
  <div class="flex items-start justify-between gap-4">
    <div class="flex flex-col gap-1">
      <h2 id="api-keys" class="text-base font-medium">API keys</h2>
      <p class="text-sm text-muted-foreground">Give each agent its own key, so you can revoke one without affecting the others.</p>
    </div>
    <CreateApiKeyDialog {organizationId} />
  </div>

  <Table.Root aria-label="API keys">
    <Table.Header>
      <Table.Row>
        <Table.Head>Name</Table.Head>
        <Table.Head>Key</Table.Head>
        <Table.Head>Last used</Table.Head>
        <Table.Head><span class="sr-only">Actions</span></Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each apiKeys as apiKey (apiKey.id)}
        <Table.Row>
          <Table.Cell class="whitespace-normal"><p class="wrap-anywhere text-sm">{apiKey.name}</p></Table.Cell>
          <Table.Cell><span class="font-mono text-xs">{apiKey.start}…</span></Table.Cell>
          <Table.Cell>
            {#if apiKey.lastUsedAt === null}
              <span class="text-muted-foreground">Never</span>
            {:else}
              <time datetime={apiKey.lastUsedAt} class="text-muted-foreground tabular-nums">{formatUtcDateTime(apiKey.lastUsedAt)} UTC</time>
            {/if}
          </Table.Cell>
          <Table.Cell class="text-right"><ApiKeyActions {apiKey} /></Table.Cell>
        </Table.Row>
      {:else}
        <Table.Row>
          <Table.Cell colspan={4}><span class="text-muted-foreground">No keys yet.</span></Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</section>
