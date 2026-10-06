<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '@moku/ui/ui/button';
  import type { Snippet } from 'svelte';

  let { recovery }: { recovery?: Snippet<[Snippet]> } = $props();

  const heading = $derived(page.status === 404 ? 'Page not found' : page.status === 403 ? 'Access denied' : 'Something went wrong');
</script>

<svelte:head>
  <title>{heading} · Moku</title>
</svelte:head>

<div class="mx-auto flex max-w-xl flex-col items-start gap-4 py-12">
  <h1 class="font-serif text-3xl tracking-tight">{heading}</h1>
  <p role="alert" class="text-sm text-muted-foreground">{page.error?.message ?? 'Please try again.'}</p>
  {#snippet retry()}
    {#if page.status >= 500}
      <Button href={page.url.pathname + page.url.search} data-sveltekit-reload>Refresh page</Button>
    {/if}
  {/snippet}
  {#if recovery}
    {@render recovery(retry)}
  {:else}
    {@render retry()}
  {/if}
  <Button href="/" variant="outline">Back to home</Button>
</div>
