<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { page } from '$app/state';
  import { Button } from '@moku/ui/ui/button';
  import ResetPasswordForm from '#lib/features/auth/ResetPasswordForm.svelte';

  let complete = $state(false);
  let heading: HTMLHeadingElement;
  let active = true;
  let token = $derived(page.url.searchParams.get('token'));

  onDestroy(() => { active = false; });

  const reset = async () => {
    if (!active) return;

    complete = true;
    await tick();
    heading?.focus();
  };
</script>

<svelte:head><title>Reset password · Moku</title><meta name="referrer" content="no-referrer" /></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="auth-heading">
  <h1 id="auth-heading" bind:this={heading} tabindex="-1" class="font-serif text-4xl tracking-tight">{complete ? 'Password reset' : 'Reset your password'}</h1>
  {#if complete}
    <Button href="/login" class="mt-8 w-full">Sign in</Button>
  {:else}
    {#if token && !page.url.searchParams.has('error')}
      {#key token}<ResetPasswordForm {token} onreset={reset} />{/key}
    {:else}
      <p role="alert" class="mt-3 text-sm text-muted-foreground">This reset link is missing, invalid, or expired.</p>
    {/if}
    <p class="mt-6 text-sm"><a href="/forgot-password" class="text-primary underline underline-offset-4">Request another reset link</a></p>
    <p class="mt-6 text-sm"><a href="/login" class="text-primary underline underline-offset-4">Back to sign in</a></p>
  {/if}
</section>
