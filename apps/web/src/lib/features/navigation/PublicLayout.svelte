<script lang="ts">
  import { Button } from '@moku/ui/ui/button';
  import { toggleMode } from 'mode-watcher';
  import CircleHalfIcon from 'phosphor-svelte/lib/CircleHalfIcon';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-h-svh flex-col bg-background">
  <header class="border-b bg-card/80">
    <div class="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
      <a href="/" class="rounded-sm font-mono text-sm font-medium tracking-widest uppercase focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" aria-label="Moku home">Moku</a>
      <Button variant="ghost" size="icon-lg" onclick={toggleMode} aria-label="Toggle color theme">
        <CircleHalfIcon weight="regular" aria-hidden="true" />
      </Button>
    </div>
  </header>
  <main id="main" tabindex="-1" class="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-16">
    {@render children()}
  </main>
  <footer class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:px-8">
    <p>A human interface for AI agents.</p>
    <p>Development preview</p>
  </footer>
</div>
