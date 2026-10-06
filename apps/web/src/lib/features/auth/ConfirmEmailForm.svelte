<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { Button } from '@moku/ui/ui/button';
  import * as Field from '@moku/ui/ui/field';
  import { authClient } from '#lib/features/auth/client.ts';
  import EmailCodeField from './EmailCodeField.svelte';

  let { email, password, requested = false, requestError = null, pending = $bindable(false), onconfirmed, onuncertain }: {
    email: string; password: string; requested?: boolean; requestError?: string | null; pending?: boolean; onconfirmed: () => Promise<void>; onuncertain: () => void;
  } = $props();
  let hasCode = $state(untrack(() => requested));
  let seconds = $state(untrack(() => requested || requestError ? 60 : 0));
  let message = $state<string | null>(untrack(() => requestError));
  let otp = $state('');
  let codeError = $state<string | null>(null);
  let active = true;
  const uncertainCompletion = 'We couldn’t confirm completion. Try signing in with your password before requesting another code.';

  onMount(() => {
    const timer = setInterval(() => { seconds = Math.max(0, seconds - 1); }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  });

  const requestCode = async () => {
    if (pending || seconds > 0) return;

    pending = true;
    message = null;
    codeError = null;
    seconds = 60;

    try {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email });
      if (error) {
        message = 'We couldn’t request a code. Try again in a minute.';
        return;
      }

      hasCode = true;
      otp = '';
    } catch {
      console.error('Confirmation code request failed');
      message = 'Check your connection and try again in a minute.';
    } finally {
      pending = false;
    }

    await tick();
    if (active) document.getElementById('email-code')?.focus();
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (pending) return;

    pending = true;
    message = null;
    codeError = null;

    try {
      const { error } = await authClient.emailOtp.resetPassword({ email, otp, password });
      if (error) {
        codeError = error.code === 'OTP_EXPIRED' ? 'This code has expired. Request another.'
          : error.code === 'INVALID_OTP' ? 'This code is invalid. Use the latest code or request another.'
          : error.code === 'TOO_MANY_ATTEMPTS' ? 'Too many attempts. Request another code.' : null;
        if (codeError) return;

        if (error.status >= 500) onuncertain();
        message = error.status >= 500 ? uncertainCompletion
          : error.status === 429 ? 'Too many attempts. Wait a minute and try again.'
          : 'We couldn’t finish confirmation. Try signing in or restart signup.';
        return;
      }
    } catch {
      console.error('Email confirmation failed');
      message = uncertainCompletion;
      onuncertain();
      return;
    } finally {
      pending = false;
    }

    await onconfirmed();
  };
</script>

{#if hasCode}
  <form method="POST" onsubmit={submit} class="mt-8" aria-busy={pending}>
    <Field.Group>
      <EmailCodeField bind:value={otp} disabled={pending} error={codeError} />
      {#if message}<Field.Error role="alert">{message}</Field.Error>{/if}
      <Button type="submit" disabled={pending}>{pending ? 'Confirming…' : 'Confirm email'}</Button>
    </Field.Group>
  </form>
  <p class="mt-4 text-sm text-muted-foreground">Didn’t get a code? <Button variant="link" onclick={requestCode} disabled={pending || seconds > 0}>{seconds > 0 ? `Resend in ${seconds}s` : 'Resend'}</Button></p>
{:else}
  {#if message}<p role="alert" class="mt-6 text-sm text-destructive">{message}</p>{/if}
  <Button onclick={requestCode} disabled={pending || seconds > 0} class="mt-8 w-full">{pending ? 'Requesting…' : seconds > 0 ? `Send code in ${seconds}s` : 'Send code'}</Button>
{/if}
