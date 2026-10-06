<script lang="ts">
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import { authClient } from '#lib/features/auth/client.ts';

  let { onsignedin, onconfirmationrequired }: {
    onsignedin: () => Promise<void>;
    onconfirmationrequired: (credentials: { email: string; password: string }) => void;
  } = $props();
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
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        if (error.code === 'EMAIL_NOT_VERIFIED') {
          onconfirmationrequired({ email, password });
          password = '';
          return;
        }

        message = error.code === 'INVALID_EMAIL_OR_PASSWORD' ? 'The email or password is incorrect.' : 'We couldn’t sign you in. Try again.';
        return;
      }
    } catch {
      console.error('Sign-in request failed');
      message = 'We couldn’t sign you in. Check your connection and try again.';
      return;
    } finally {
      pending = false;
    }

    password = '';
    await onsignedin();
  };
</script>

<form method="POST" onsubmit={submit} class="mt-8" aria-busy={pending}>
  <Field.Group>
    <Field.Field>
      <Field.Label for="email">Email</Field.Label>
      <Input id="email" name="email" type="email" autocomplete="username" bind:value={email} required disabled={pending} />
    </Field.Field>
    <Field.Field>
      <Field.Label for="password">Password</Field.Label>
      <Input id="password" name="password" type="password" autocomplete="current-password" bind:value={password} required disabled={pending} />
    </Field.Field>
    {#if message}<Field.Error role="alert">{message}</Field.Error>{/if}
    <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
  </Field.Group>
</form>
