<script lang="ts">
  import { Button } from '@moku/ui/ui/button';

  let pending = $state(false);
  let message = $state('');
  async function signIn(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();
    pending = true;
    message = '';
    const fields = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: fields.get('email'), password: fields.get('password') }),
      });
      if (response.ok) window.location.assign('/');
      else message = response.status === 403 ? 'Verify your email before signing in.'
        : response.status === 401 || response.status === 400 ? 'Check your email and password, then try again.'
        : response.status === 429 ? 'Too many attempts. Wait a minute, then try again.'
        : 'Sign in is unavailable. Try again.';
    } catch {
      message = 'Couldn’t reach Moku. Check your connection and try again.';
    } finally {
      pending = false;
    }
  }
</script>

<svelte:head><title>Sign in · Moku</title></svelte:head>

<section class="mx-auto flex max-w-sm flex-col gap-8" aria-labelledby="login-heading">
  <div class="flex flex-col gap-3">
    <h1 id="login-heading" class="font-serif text-4xl tracking-tight">Sign in to Moku</h1>
    <p class="text-sm text-muted-foreground">Review what your agents need from you.</p>
  </div>
  <form method="POST" onsubmit={signIn} class="flex flex-col gap-5">
    {#each ['email', 'password'] as field (field)}
      <div class="flex flex-col gap-2">
        <label for={field} class="text-sm font-medium">{field === 'email' ? 'Email' : 'Password'}</label>
        <input id={field} name={field} type={field} required autocomplete={field === 'email' ? 'username' : 'current-password'}
          aria-describedby={message ? 'login-message' : undefined}
          class="h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
    {/each}
    {#if message}<p id="login-message" role="alert" class="text-sm text-destructive">{message}</p>{/if}
    <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
  </form>
</section>
