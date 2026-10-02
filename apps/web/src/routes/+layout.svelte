<script lang="ts">
  import { page } from '$app/state';
  import { ModeWatcher, toggleMode } from 'mode-watcher';
  import CircleHalfIcon from 'phosphor-svelte/lib/CircleHalfIcon';
  import { Button } from '@moku/ui/ui/button';
  import favicon from '../favicon.svg';
  import '../app.css';

  let { children } = $props();
  let signingOut = $state(false);
  let signoutError = $state('');
  async function signOut() {
    signingOut = true;
    signoutError = '';
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (response.ok) window.location.assign('/login');
      else signoutError = 'Couldn’t sign out. Try again.';
    } catch {
      signoutError = 'Couldn’t reach Moku. Try again.';
    } finally {
      signingOut = false;
    }
  }
</script>

<svelte:head>
  <link rel="icon" type="image/svg+xml" href={favicon} />
  <title>Moku</title>
  <meta name="description" content="A human interface for AI agents." />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<ModeWatcher />

<a
  href="#main"
  class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:outline-2 focus:outline-ring"
>Skip to content</a>

<div class="flex min-h-svh flex-col bg-background">
  <header class="border-b bg-card/80">
    <div class="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
      <a href="/" class="rounded-sm font-mono text-sm font-medium tracking-widest uppercase focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" aria-label="Moku home">Moku</a>
      <nav aria-label="Main navigation" class="flex items-center gap-3 sm:gap-6">
        <a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined} class="rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Inbox</a>
        {#if page.url.pathname !== '/login'}
          <Button variant="ghost" disabled={signingOut} onclick={signOut}>{signingOut ? 'Signing out…' : 'Sign out'}</Button>
        {/if}
        <Button variant="ghost" size="icon-lg" onclick={toggleMode} aria-label="Toggle color theme">
          <CircleHalfIcon weight="regular" aria-hidden="true" />
        </Button>
      </nav>
    </div>
  </header>

  <main id="main" tabindex="-1" class="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-16">
    {#if signoutError}<p role="alert" class="mb-6 text-sm text-destructive">{signoutError}</p>{/if}
    {@render children()}
  </main>

  <footer class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:px-8">
    <p>A human interface for AI agents.</p>
    <p>Development preview</p>
  </footer>
</div>
