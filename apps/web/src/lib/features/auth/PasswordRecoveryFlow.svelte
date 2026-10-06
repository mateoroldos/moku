<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { Button } from '@moku/ui/ui/button';
  import RequestResetForm from './RequestResetForm.svelte';
  import ResetPasswordForm from './ResetPasswordForm.svelte';
  import PasswordResetSuccess from './PasswordResetSuccess.svelte';

  let email = $state('');
  let pending = $state(false);
  let seconds = $state(0);
  let uncertain = $state(false);
  let active = true;
  let step = $state<'request' | 'reset' | 'complete'>('request');
  let heading: HTMLHeadingElement;
  let title = $derived(step === 'request' ? 'Forgot your password?' : step === 'reset' ? 'Reset your password' : 'Password reset');

  onDestroy(() => { active = false; });

  const advance = async (next: typeof step) => {
    if (!active) return;

    step = next;
    uncertain = false;
    await tick();
    heading?.focus();
  };
</script>

<svelte:head><title>{title} · Moku</title></svelte:head>

<h1 id="auth-heading" bind:this={heading} tabindex="-1" class="font-serif text-4xl tracking-tight">{title}</h1>
{#if step === 'request'}
  <p class="mt-3 text-sm text-muted-foreground">We’ll email you a reset code.</p>
  <RequestResetForm bind:email bind:seconds onrequested={() => advance('reset')} />
  <p class="mt-6 text-sm"><a href="/login" class="text-primary underline underline-offset-4">Back to sign in</a></p>
{:else if step === 'reset'}
  <p class="mt-3 text-sm text-muted-foreground">Enter the code for <span class="break-all text-foreground">{email}</span>. <Button variant="link" onclick={() => advance('request')} disabled={pending}>Edit</Button></p>
  <ResetPasswordForm {email} bind:pending bind:seconds onreset={() => advance('complete')} onuncertain={() => { uncertain = true; }} />
  {#if uncertain}<p class="mt-4 text-sm"><a href="/login" class="text-primary underline underline-offset-4">Sign in</a></p>{/if}
{:else}
  <PasswordResetSuccess />
{/if}
