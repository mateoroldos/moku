<script lang="ts">
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import { authClient } from '#lib/features/auth/client.ts';
  import PasswordConfirmationForm from './PasswordConfirmationForm.svelte';

  let name = $state('');
  let email = $state('');
  let password = $state('');
  let pending = $state(false);
  let message = $state<string | null>(null);
  let verifying = $state(false);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (pending) return;

    pending = true;
    message = null;

    try {
      const { error } = await authClient.signUp.email({ name, email, password });
      if (error) {
        message = 'We couldn’t create your account. Check your details and try again.';
        return;
      }

      const requested = await authClient.emailOtp.requestPasswordReset({ email });
      if (requested.error) {
        message = 'We couldn’t request a code. Wait a minute, then try again or reset your password.';
        return;
      }

      verifying = true;
    } catch {
      console.error('Sign-up request failed');
      message = 'We couldn’t confirm signup. Try signing in or request another verification code.';
    } finally {
      pending = false;
    }
  };
</script>

{#if verifying}
  <PasswordConfirmationForm mode="signup" {email} bind:password cooldown={60} />
  <p class="mt-6 text-sm"><a href="/signup" data-sveltekit-reload class="text-primary underline underline-offset-4">Use a different email</a></p>
{:else}
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
      <Field.Field>
        <Field.Label for="password">Password</Field.Label>
        <Input id="password" name="password" type="password" autocomplete="new-password" minlength={8} maxlength={128} bind:value={password} required disabled={pending} aria-describedby="password-help" />
        <Field.Description id="password-help">Use at least 8 characters.</Field.Description>
      </Field.Field>
      {#if message}<Field.Error role="alert">{message}</Field.Error>{/if}
      <Button type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</Button>
    </Field.Group>
  </form>
  {#if message}<p class="mt-6 text-sm"><a href="/reset-password" class="text-primary underline underline-offset-4">Reset your password</a></p>{/if}
{/if}
