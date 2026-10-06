<script lang="ts">
  import { goto } from '$app/navigation';
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import { authClient } from '#lib/features/auth/client.ts';

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
      const { error } = await authClient.signUp.email({ name, email, password });
      if (error) {
        message = 'We couldn’t create your account. Check your details and try again.';
        return;
      }

      password = '';
      await goto(`/verify-email?email=${encodeURIComponent(email)}&from=signup`);
    } catch {
      console.error('Sign-up request failed');
      message = 'We couldn’t confirm signup. Try signing in or request another verification code.';
    } finally {
      pending = false;
    }
  };
</script>

<svelte:head><title>Create account · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="signup-heading">
  <h1 id="signup-heading" class="font-serif text-4xl tracking-tight">Create your account</h1>
  <p class="mt-3 text-sm text-muted-foreground">Verify your email to create an organization and review tasks.</p>
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
  <p class="mt-6 text-sm text-muted-foreground">Already have an account? <a href="/login" class="text-primary underline underline-offset-4">Sign in</a></p>
</section>
