<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '@moku/ui/ui/button';
  import type { Snippet } from 'svelte';

  let { fallback }: { fallback: Snippet } = $props();
  const created = $derived(page.state.createdOrganization);
</script>

{#if created && page.url.pathname === `/org/${encodeURIComponent(created.id)}`}
  <p role="status">{created.name} was created, but its inbox could not be opened.</p>
  <Button href={page.url.pathname} data-sveltekit-reload>Open organization</Button>
{:else}
  {@render fallback()}
{/if}
