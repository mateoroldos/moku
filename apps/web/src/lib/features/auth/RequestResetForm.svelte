<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import { authClient } from '#lib/features/auth/client.ts';

  let { email = $bindable(''), seconds = $bindable(0), onrequested }: { email?: string; seconds?: number; onrequested: () => void } = $props();
  let pending = $state(false);
  let message = $state<string | null>(null);

  onMount(() => {
    const timer = setInterval(() => { seconds = Math.max(0, seconds - 1); }, 1000);
    return () => clearInterval(timer);
  });

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (pending || seconds > 0) return;

    pending = true;
    message = null;
    seconds = 60;

    try {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email });
      if (error) {
        message = 'We couldn’t request a code. Try again in a minute.';
        return;
      }
    } catch {
      console.error('Password reset code request failed');
      message = 'Check your connection and try again in a minute.';
      return;
    } finally {
      pending = false;
    }

    onrequested();
  };
</script>

<form method="POST" onsubmit={submit} class="mt-8" aria-busy={pending}>
  <Field.Group>
    <Field.Field>
      <Field.Label for="email">Email</Field.Label>
      <Input id="email" name="email" type="email" autocomplete="email" required bind:value={email} disabled={pending} />
    </Field.Field>
    {#if message}<Field.Error role="alert">{message}</Field.Error>{/if}
    <Button type="submit" disabled={pending || seconds > 0}>{pending ? 'Requesting…' : seconds > 0 ? `Send reset code in ${seconds}s` : 'Send reset code'}</Button>
  </Field.Group>
</form>
