<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '@moku/ui/ui/button';

  const heading = $derived(page.status === 404 ? 'Task not found' : page.status === 403 ? 'Access denied' : 'Task unavailable');
</script>

<svelte:head><title>{heading} · Moku</title></svelte:head>

<div class="mx-auto flex max-w-3xl flex-col items-start gap-4 py-10">
  <p class="font-mono text-xs text-muted-foreground">{page.status}</p>
  <h1 class="font-serif text-3xl tracking-tight">{heading}</h1>
  <p class="text-sm text-muted-foreground">{page.error?.message}</p>
  {#if page.status >= 500}
    <Button href={page.url.pathname + page.url.search} data-sveltekit-reload>Refresh task</Button>
  {/if}
  <Button href={page.params.organizationId ? `/org/${encodeURIComponent(page.params.organizationId)}` : '/'} variant="outline">Back to inbox</Button>
</div>
