<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Button } from '@moku/ui/ui/button';
  import * as Field from '@moku/ui/ui/field';
  import * as InputOTP from '@moku/ui/ui/input-otp';
  import { authClient } from '#lib/features/auth/client.ts';

  let email = $derived(page.url.searchParams.get('email') ?? '');
  let restart = $derived(page.url.searchParams.get('from') === 'signup' ? '/signup' : '/login');
  let otp = $state('');
  let pending = $state<'verify' | 'resend' | null>(null);
  let feedback = $state<{ kind: 'error' | 'status'; message: string } | null>(null);
  let seconds = $state(60);

  onMount(() => {
    const timer = setInterval(() => { seconds = Math.max(0, seconds - 1); }, 1000);
    return () => clearInterval(timer);
  });

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (pending) return;

    pending = 'verify';
    feedback = null;

    try {
      const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
      if (error) {
        feedback = { kind: 'error', message: error.code === 'EMAIL_ALREADY_VERIFIED' ? 'Your email is already verified. Sign in with your password.' : error.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'We couldn’t verify this code. Check it or request another.' };
        return;
      }

      otp = '';
      await goto('/', { refreshAll: true });
    } catch {
      console.error('Email verification request failed');
      feedback = { kind: 'error', message: 'We couldn’t confirm verification. Try signing in.' };
    } finally {
      pending = null;
    }
  };

  const resend = async () => {
    if (pending || seconds > 0) return;

    pending = 'resend';
    feedback = null;
    seconds = 60;

    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' });
      feedback = error
        ? { kind: 'error', message: 'We couldn’t request a code. Check your email address and try again in a minute.' }
        : { kind: 'status', message: 'Code requested. Check your email and use the latest code.' };
    } catch {
      console.error('Verification resend request failed');
      feedback = { kind: 'error', message: 'Check your connection and request another code in a minute.' };
    } finally {
      pending = null;
    }
  };
</script>

<svelte:head><title>Verify email · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="verification-heading">
  <h1 id="verification-heading" class="font-serif text-4xl tracking-tight">Verify your email</h1>
  {#if email}
  <p class="mt-3 text-sm text-muted-foreground">Enter the six-digit code for <span class="break-all text-foreground">{email}</span>. It expires after five minutes.</p>
  <form method="POST" onsubmit={submit} class="mt-8" aria-busy={pending !== null}>
    <Field.Group>
      <Field.Field data-invalid={feedback?.kind === 'error'}>
        <Field.Label for="verification-code">Verification code</Field.Label>
        <InputOTP.Root inputId="verification-code" name="otp" maxlength={6} minlength={6} pattern="^[0-9]*$" autocomplete="one-time-code" inputmode="numeric" required bind:value={otp} disabled={pending !== null} aria-invalid={feedback?.kind === 'error'} aria-describedby="verification-feedback">
          {#snippet children({ cells })}
            <InputOTP.Group>
              {#each cells as cell (cell)}<InputOTP.Slot {cell} aria-invalid={feedback?.kind === 'error'} />{/each}
            </InputOTP.Group>
          {/snippet}
        </InputOTP.Root>
        <div id="verification-feedback">
          {#if feedback?.kind === 'error'}<Field.Error role="alert">{feedback.message}</Field.Error>
          {:else if feedback}<p role="status" class="text-sm text-muted-foreground">{feedback.message}</p>{/if}
        </div>
      </Field.Field>
      <Button type="submit" disabled={pending !== null}>{pending === 'verify' ? 'Verifying…' : 'Verify email'}</Button>
      <Button type="button" variant="outline" onclick={resend} disabled={pending !== null || seconds > 0}>{seconds > 0 ? `Resend in ${seconds}s` : 'Resend code'}</Button>
    </Field.Group>
  </form>
  <p class="mt-6 text-sm"><a href={restart} class="text-primary underline underline-offset-4">Use a different email</a></p>
  {:else}
  <p class="mt-3 text-sm text-muted-foreground">Start with your email address to request a verification code.</p>
  <p class="mt-6 text-sm"><a href="/signup" class="text-primary underline underline-offset-4">Create an account</a></p>
  {/if}
  <p class="mt-6 text-sm"><a href="/login" class="text-primary underline underline-offset-4">Back to sign in</a></p>
</section>
