<script lang="ts">
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import { authClient } from '#lib/features/auth/client.ts';
  import NewPasswordField from './NewPasswordField.svelte';

  let { callbackURL, oncreated }: { callbackURL: string; oncreated: (email: string) => Promise<void> } = $props();

  let name = $state('');
  let email = $state('');
  let password = $state('');
  let pending = $state(false);
  let message = $state<string | null>(null);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (pending) return;

    pending = true;
    message = null;

    try {
      const { error } = await authClient.signUp.email({ name, email, password, callbackURL });
      if (error) {
        message = 'We couldn’t create your account. Check your details and try again.';
        return;
      }
    } catch {
      console.error('Sign-up request failed');
      message = 'We couldn’t confirm signup. Check your connection and try again.';
      return;
    } finally {
      pending = false;
    }

    password = '';
    await oncreated(email);
  };
</script>

  <form method="POST" onsubmit={submit} class="mt-8" aria-busy={pending}>
    <Field.Group>
      <Field.Field>
        <Field.Label for="name">Name</Field.Label>
        <Input id="name" name="name" autocomplete="name" bind:value={name} required disabled={pending} />
      </Field.Field>
      <Field.Field>
        <Field.Label for="email">Email</Field.Label>
        <Input id="email" name="email" type="email" autocomplete="email" bind:value={email} required disabled={pending} />
      </Field.Field>
      <NewPasswordField bind:value={password} disabled={pending} />
      {#if message}<Field.Error role="alert">{message}</Field.Error>{/if}
      <Button type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</Button>
    </Field.Group>
  </form>
