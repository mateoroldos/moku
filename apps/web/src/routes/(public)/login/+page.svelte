<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Button } from '@moku/ui/ui/button';
  import LoginForm from '#lib/features/auth/LoginForm.svelte';

  let navigationFailed = $state(false);
  let active = true;

  onDestroy(() => { active = false; });

  const signedIn = async () => {
    if (!active) return;

    try {
      await goto('/', { refreshAll: true });
    } catch {
      console.error('Navigation after sign-in failed');
      navigationFailed = true;
    }
  };

  const confirmationRequired = async () => {
    if (active) await goto('/verify-email');
  };
</script>

<svelte:head><title>Sign in · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="auth-heading">
  <h1 id="auth-heading" class="font-serif text-4xl tracking-tight">Sign in to review</h1>
  {#if navigationFailed}
    <p role="status" class="mt-3 text-sm text-muted-foreground">You’re signed in. Continue to open the app.</p>
    <Button href="/" class="mt-8 w-full">Continue</Button>
  {:else}
    {#if page.url.searchParams.has('error')}
      <p role="alert" class="mt-3 text-sm text-destructive">This verification link is invalid or expired. <a href="/verify-email" class="underline underline-offset-4">Request another link</a>.</p>
    {:else if page.url.searchParams.get('verified') === 'true'}
      <p role="status" class="mt-3 text-sm text-muted-foreground">Email verified. Sign in to continue.</p>
    {:else if page.url.searchParams.get('reset') === 'true'}
      <p role="status" class="mt-3 text-sm text-muted-foreground">Your password has been reset. Sign in with your new password.</p>
    {/if}
    <LoginForm onsignedin={signedIn} onconfirmationrequired={confirmationRequired} />
    <p class="mt-6 text-sm"><a href="/forgot-password" class="text-primary underline underline-offset-4">Forgot password?</a></p>
    <p class="mt-6 text-sm text-muted-foreground">New to Moku? <a href="/signup" class="text-primary underline underline-offset-4">Create an account</a></p>
  {/if}
</section>
