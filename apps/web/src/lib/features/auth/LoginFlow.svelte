<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button } from '@moku/ui/ui/button';
  import { authClient } from '#lib/features/auth/client.ts';
  import LoginForm from './LoginForm.svelte';
  import ConfirmEmailForm from './ConfirmEmailForm.svelte';

  type Step = { kind: 'login' } | { kind: 'confirm'; email: string; password: string } | { kind: 'complete' };

  let step = $state<Step>({ kind: 'login' });
  let signingIn = $state(false);
  let pending = $state(false);
  let uncertain = $state(false);
  let active = true;
  let navigationFailed = $state(false);
  let heading: HTMLHeadingElement;
  let title = $derived(step.kind === 'login' ? 'Sign in to review' : step.kind === 'complete' ? 'Email confirmed' : 'Confirm your email');

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

  const confirmationRequired = async (credentials: { email: string; password: string }) => {
    if (!active) return;

    step = { kind: 'confirm', ...credentials };
    await tick();
    heading?.focus();
  };

  const confirmed = async () => {
    if (!active || step.kind !== 'confirm') return;

    const { email, password } = step;
    step = { kind: 'complete' };
    signingIn = true;

    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (!error) await signedIn();
    } catch {
      console.error('Sign-in after confirmation failed');
    } finally {
      signingIn = false;
      await tick();
      heading?.focus();
    }
  };
</script>

<svelte:head><title>{title} · Moku</title></svelte:head>

<h1 id="auth-heading" bind:this={heading} tabindex="-1" class="font-serif text-4xl tracking-tight">{title}</h1>
{#if navigationFailed}
  <p role="status" class="mt-3 text-sm text-muted-foreground">You’re signed in. Continue to open the app.</p>
  <Button href="/" class="mt-8 w-full">Continue</Button>
{:else if step.kind === 'login'}
  <LoginForm onsignedin={signedIn} onconfirmationrequired={confirmationRequired} />
  <p class="mt-6 text-sm"><a href="/reset-password" class="text-primary underline underline-offset-4">Forgot password?</a></p>
  <p class="mt-6 text-sm text-muted-foreground">New to Moku? <a href="/signup" class="text-primary underline underline-offset-4">Create an account</a></p>
{:else if step.kind === 'complete'}
  <Button href="/login" data-sveltekit-reload disabled={signingIn} class="mt-8 w-full">{signingIn ? 'Signing in…' : 'Sign in'}</Button>
{:else}
  <p class="mt-3 text-sm text-muted-foreground">Confirm <span class="break-all text-foreground">{step.email}</span> to finish signing in. <Button href="/login" data-sveltekit-reload variant="link" disabled={pending}>Edit</Button></p>
  <ConfirmEmailForm email={step.email} password={step.password} bind:pending onconfirmed={confirmed} onuncertain={() => { uncertain = true; }} />
  {#if uncertain}<p class="mt-4 text-sm"><a href="/login" data-sveltekit-reload class="text-primary underline underline-offset-4">Sign in</a></p>{/if}
{/if}
