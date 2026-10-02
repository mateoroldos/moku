<script lang="ts">
  import { goto } from '$app/navigation';
  import { Button } from '@moku/ui/ui/button';
  import { authClient } from '#lib/features/auth/client.ts';

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
        message = error.code === 'INVALID_EMAIL_OR_PASSWORD'
          ? 'The email or password is incorrect.'
          : 'We couldn’t sign you in. Try again.';
        return;
      }
      await goto('/', { refreshAll: true });
    } catch {
      // Report only the operation; provider failures may contain credentials.
      console.error('Sign-in request failed');
      message = 'We couldn’t sign you in. Check your connection and try again.';
    } finally {
      pending = false;
    }
  };
</script>

<svelte:head><title>Sign in · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="login-heading">
  <h1 id="login-heading" class="font-serif text-4xl tracking-tight">Sign in to review</h1>
  <p class="mt-3 text-sm text-muted-foreground">Use the account provided by your administrator.</p>
  <form method="POST" onsubmit={submit} class="mt-8 space-y-5" aria-busy={pending}>
    <div class="space-y-2">
      <label for="email" class="text-sm font-medium">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" bind:value={email} required class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </div>
    <div class="space-y-2">
      <label for="password" class="text-sm font-medium">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" bind:value={password} required class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </div>
    {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
    <Button type="submit" disabled={pending} class="w-full">{pending ? 'Signing in…' : 'Sign in'}</Button>
  </form>
</section>
