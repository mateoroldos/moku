<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button } from '@moku/ui/ui/button';
  import { authClient } from '#lib/features/auth/client.ts';
  import SignupForm from '#lib/features/auth/SignupForm.svelte';
  import ConfirmEmailForm from '#lib/features/auth/ConfirmEmailForm.svelte';

  type Step =
    | { kind: 'signup' }
    | { kind: 'requesting'; email: string }
    | { kind: 'confirm'; email: string; password: string; requested: boolean; requestError: string | null }
    | { kind: 'complete' };

  let step = $state<Step>({ kind: 'signup' });
  let signingIn = $state(false);
  let pending = $state(false);
  let uncertain = $state(false);
  let active = true;
  let heading: HTMLHeadingElement;
  let title = $derived(step.kind === 'signup' ? 'Create your account' : step.kind === 'complete' ? 'Email confirmed' : 'Confirm your email');

  onDestroy(() => { active = false; });

  const created = async ({ email, password }: { email: string; password: string }) => {
    if (!active) return;

    step = { kind: 'requesting', email };
    await tick();
    if (!active) return;

    heading.focus();

    let requestError: string | null = null;
    try {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email });
      if (error) requestError = 'We couldn’t request a code. Try again in a minute.';
    } catch {
      console.error('Signup code request failed');
      requestError = 'Check your connection and try again in a minute.';
    }

    if (active) step = { kind: 'confirm', email, password, requested: requestError === null, requestError };
  };

  const confirmed = async () => {
    if (!active || step.kind !== 'confirm') return;

    const { email, password } = step;
    step = { kind: 'complete' };
    signingIn = true;

    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (!error && active) await goto('/', { refreshAll: true });
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

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="auth-heading">
<h1 id="auth-heading" bind:this={heading} tabindex="-1" class="font-serif text-4xl tracking-tight">{title}</h1>
{#if step.kind === 'signup'}
  <SignupForm oncreated={created} />
  <p class="mt-6 text-sm text-muted-foreground">Already have an account? <a href="/login" class="text-primary underline underline-offset-4">Sign in</a></p>
{:else if step.kind === 'complete'}
  <Button href="/login" disabled={signingIn} class="mt-8 w-full">{signingIn ? 'Signing in…' : 'Sign in'}</Button>
{:else}
  <p class="mt-3 text-sm text-muted-foreground">Confirm <span class="break-all text-foreground">{step.email}</span> to finish signup. <Button href="/signup" data-sveltekit-reload variant="link" disabled={pending || step.kind === 'requesting'}>Edit</Button></p>
  {#if step.kind === 'requesting'}
    <p role="status" class="mt-8 text-sm text-muted-foreground">Requesting code…</p>
  {:else}
    <ConfirmEmailForm email={step.email} password={step.password} requested={step.requested} requestError={step.requestError} bind:pending onconfirmed={confirmed} onuncertain={() => { uncertain = true; }} />
    {#if uncertain}<p class="mt-4 text-sm"><a href="/login" class="text-primary underline underline-offset-4">Sign in</a></p>{/if}
  {/if}
{/if}
</section>
