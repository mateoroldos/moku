<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '@moku/ui/ui/button';

  const heading = $derived(page.status === 404 ? 'Page not found' : page.status === 403 ? 'Access denied' : 'Something went wrong');
  const created = $derived(page.state.createdOrganization);
  const openingCreated = $derived(created && page.url.pathname === `/org/${encodeURIComponent(created.id)}`);
</script>

<svelte:head>
  <title>{heading} · Moku</title>
</svelte:head>

<div class="mx-auto flex max-w-xl flex-col items-start gap-4 py-12">
  <h1 class="font-serif text-3xl tracking-tight">{heading}</h1>
  {#if openingCreated}<p role="status">{created?.name} was created, but its inbox could not be opened.</p>{/if}
  <p role="alert" class="text-sm text-muted-foreground">{page.error?.message ?? 'Please try again.'}</p>
  {#if openingCreated || page.status >= 500}
    <Button href={page.url.pathname + page.url.search} data-sveltekit-reload>{openingCreated ? 'Open organization' : 'Refresh page'}</Button>
  {/if}
  <Button href="/" variant="outline">Back to home</Button>
</div>
