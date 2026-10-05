<script lang="ts">
  import { Button } from '@moku/ui/ui/button';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.organizations.length > 0 ? 'Choose organization' : 'No organization access'} · Moku</title></svelte:head>
<div class="flex flex-col gap-3">
  {#if data.organizations.length > 0}
    <h1 class="font-serif text-4xl tracking-tight">Choose organization</h1>
    <ul class="flex flex-col items-start gap-2">
      {#each data.organizations as organization (organization.id)}
        <li><Button variant="outline" href={`/org/${encodeURIComponent(organization.id)}`}>{organization.name}</Button></li>
      {/each}
    </ul>
  {:else}
  <h1 class="font-serif text-4xl tracking-tight">No organization access</h1>
  <p class="text-sm text-muted-foreground">Ask the person who set up your account to add you to an organization.</p>
  {/if}
</div>
