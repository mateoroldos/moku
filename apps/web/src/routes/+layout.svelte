<script lang="ts">
  import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from '@moku/ui/ui/sonner';
  import favicon from '../favicon.svg';
  import '../app.css';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" type="image/svg+xml" href={favicon} />
  <title>Moku</title>
  <meta name="description" content="A human interface for AI agents." />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<ModeWatcher />
<Toaster closeButton />

<a
  href="#main"
  class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:outline-2 focus:outline-ring"
>Skip to content</a>

{@render children()}
