<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '@moku/ui/ui/button';
  import * as Field from '@moku/ui/ui/field';
  import { authClient } from '#lib/features/auth/client.ts';
  import EmailCodeField from './EmailCodeField.svelte';
  import NewPasswordField from './NewPasswordField.svelte';

  let { email, pending = $bindable(false), seconds = $bindable(60), onreset, onuncertain }: { email: string; pending?: boolean; seconds?: number; onreset: () => void; onuncertain: () => void } = $props();
  let otp = $state('');
  let password = $state('');
  let message = $state<string | null>(null);
  let codeError = $state<string | null>(null);
  const uncertainCompletion = 'We couldn’t confirm the reset. Try signing in with your new password before requesting another code.';

  onMount(() => {
    const timer = setInterval(() => { seconds = Math.max(0, seconds - 1); }, 1000);
    return () => clearInterval(timer);
  });

  const resend = async () => {
    if (pending || seconds > 0) return;

    pending = true;
    message = null;
    codeError = null;
    seconds = 60;

    try {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email });
      if (error) message = 'We couldn’t request a code. Try again in a minute.';
      else otp = '';
    } catch {
      console.error('Password reset code request failed');
      message = 'Check your connection and try again in a minute.';
    } finally {
      pending = false;
    }
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
          : 'We couldn’t reset your password. Check the code and password, then try again.';
        return;
      }
    } catch {
      console.error('Password reset failed');
      message = uncertainCompletion;
      onuncertain();
      return;
    } finally {
      pending = false;
    }

    password = '';
    otp = '';
    onreset();
  };
</script>

<form method="POST" onsubmit={submit} class="mt-8" aria-busy={pending}>
  <Field.Group>
    <EmailCodeField bind:value={otp} disabled={pending} error={codeError} />
    <NewPasswordField bind:value={password} disabled={pending} />
    {#if message}<Field.Error role="alert">{message}</Field.Error>{/if}
    <Button type="submit" disabled={pending}>{pending ? 'Resetting…' : 'Reset password'}</Button>
  </Field.Group>
</form>
<p class="mt-4 text-sm text-muted-foreground">Didn’t get a code? <Button variant="link" onclick={resend} disabled={pending || seconds > 0}>{seconds > 0 ? `Resend in ${seconds}s` : 'Resend'}</Button></p>
