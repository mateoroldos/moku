<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import * as InputOTP from '@moku/ui/ui/input-otp';
  import { authClient } from '#lib/features/auth/client.ts';

  let { email, password = $bindable(''), cooldown = 0 }: { email: string; password?: string; cooldown?: number } = $props();
  let otp = $state('');
  let pending = $state<'verify' | 'resend' | null>(null);
  let feedback = $state<{ kind: 'error' | 'status'; message: string } | null>(null);
  let seconds = $state(untrack(() => cooldown));
  let completed = $state(false);
  const uncertainCompletion = 'We couldn’t confirm completion. Try signing in with your chosen password before requesting another code.';

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
      const { error } = await authClient.emailOtp.resetPassword({ email, otp, password });
      if (error) {
        feedback = { kind: 'error', message: error.status >= 500 ? uncertainCompletion : error.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'We couldn’t set your password. Check the code and password, or request another code.' };
        return;
      }

      completed = true;
      const signedIn = await authClient.signIn.email({ email, password });
      if (signedIn.error) return;

      await goto('/', { refreshAll: true });
    } catch {
      console.error('Email verification request failed');
      feedback = { kind: 'error', message: uncertainCompletion };
    } finally {
      if (completed) password = '';
      pending = null;
    }
  };

  const resend = async () => {
    if (pending || seconds > 0) return;

    pending = 'resend';
    feedback = null;
    seconds = 60;

    try {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email });
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

{#if completed}
  <p role="status" class="mt-6 text-sm">Your password is set. <a href="/login" class="text-primary underline underline-offset-4">Continue to sign in</a></p>
{:else}
  <p class="mt-3 text-sm text-muted-foreground">Request a code if needed, then enter the six-digit code for <span class="break-all text-foreground">{email}</span>. Codes expire after five minutes.</p>
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
      <Field.Field>
        <Field.Label for="password">Password</Field.Label>
        <Input id="password" name="password" type="password" autocomplete="new-password" minlength={8} maxlength={128} required bind:value={password} disabled={pending !== null} aria-describedby="password-help" />
        <Field.Description id="password-help">Use at least 8 characters. This will replace any previous password.</Field.Description>
      </Field.Field>
      <Button type="submit" disabled={pending !== null}>{pending === 'verify' ? 'Finishing…' : 'Set password and sign in'}</Button>
      <Button type="button" variant="outline" onclick={resend} disabled={pending !== null || seconds > 0}>{seconds > 0 ? `Request code in ${seconds}s` : 'Request code'}</Button>
    </Field.Group>
  </form>
{/if}
