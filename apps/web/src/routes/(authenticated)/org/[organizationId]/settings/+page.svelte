<script lang="ts">
  import { getOrganization } from '#lib/features/organizations/organizations.remote.ts';
  import DeleteOrganization from '#lib/features/organizations/DeleteOrganization.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const organization = $derived(await getOrganization(data.organizationId));
</script>

<svelte:head>
  <title>Settings · Moku</title>
</svelte:head>

<div class="flex flex-col gap-6">
  <h1 class="font-serif text-3xl tracking-tight">Settings</h1>
  {#if data.canDeleteOrganization}
    <DeleteOrganization {organization} />
  {:else}
    <p class="text-muted-foreground">Only owners can change this organization’s settings.</p>
  {/if}
</div>
