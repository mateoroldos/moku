<script lang="ts">
  import { Button } from '@moku/ui/ui/button';
  import * as Field from '@moku/ui/ui/field';
  import { authClient } from '#lib/features/auth/client.ts';
  import NewPasswordField from './NewPasswordField.svelte';

  let { token, onreset }: { token: string; onreset: () => Promise<void> } = $props();

  let password = $state('');
  let pending = $state(false);
  let message = $state<string | null>(null);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (pending) return;

    pending = true;
    message = null;

    try {
      const { error } = await authClient.resetPassword({ token, newPassword: password });
      if (error) {
        message = error.code === 'INVALID_TOKEN' ? 'This link is invalid or expired. Request another reset link.'
          : error.status >= 500 ? 'We couldn’t confirm the reset. Try signing in with your new password.'
          : 'We couldn’t reset your password. Try again.';
        return;
      }
    } catch {
      console.error('Password reset failed');
      message = 'We couldn’t confirm the reset. Try signing in with your new password.';
      return;
    } finally {
      pending = false;
    }

    password = '';
    await onreset();
  };
</script>

<form method="POST" onsubmit={submit} class="mt-8" aria-busy={pending}>
  <Field.Group>
    <NewPasswordField bind:value={password} disabled={pending} />
    {#if message}<Field.Error role="alert">{message}</Field.Error>{/if}
    <Button type="submit" disabled={pending}>{pending ? 'Resetting…' : 'Reset password'}</Button>
  </Field.Group>
</form>
