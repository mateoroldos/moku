<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import { authClient } from '#lib/features/auth/client.ts';

  let email = $state('');
  let requestedEmail = $state<string | null>(null);
  let seconds = $state(0);
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
    requestedEmail = null;
    seconds = 60;

    try {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: '/login?verified=true' });
      if (error) {
        message = 'We couldn’t request a link. Try again in a minute.';
        return;
      }
    } catch {
      console.error('Verification link request failed');
      message = 'Check your connection and try again in a minute.';
      return;
    } finally {
      pending = false;
    }

    requestedEmail = email;
  };
</script>

<form method="POST" onsubmit={submit} class="mt-8" aria-busy={pending}>
  <Field.Group>
    <Field.Field>
      <Field.Label for="email">Email</Field.Label>
      <Input id="email" name="email" type="email" autocomplete="email" required bind:value={email} disabled={pending} />
    </Field.Field>
    {#if message}<Field.Error role="alert">{message}</Field.Error>{/if}
    <Button type="submit" disabled={pending || seconds > 0}>{pending ? 'Requesting…' : seconds > 0 ? `Send verification link in ${seconds}s` : 'Send verification link'}</Button>
  </Field.Group>
</form>
{#if requestedEmail}<p role="status" class="mt-4 text-sm text-muted-foreground">If <span class="break-all text-foreground">{requestedEmail}</span> needs verification, check its inbox for a link.</p>{/if}
