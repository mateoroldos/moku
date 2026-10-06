<script lang="ts">
  import { page } from '$app/state';
  import VerifyEmailForm from '#lib/features/auth/VerifyEmailForm.svelte';

  let email = $derived(page.url.searchParams.get('email') ?? '');
</script>

<svelte:head><title>Confirm your password · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="verification-heading">
  <h1 id="verification-heading" class="font-serif text-4xl tracking-tight">Confirm your password</h1>
  {#if email}
    {#key email}<VerifyEmailForm {email} />{/key}
  {:else}
    <p class="mt-3 text-sm text-muted-foreground">Start from signup or password recovery to confirm your email and password.</p>
    <p class="mt-6 text-sm"><a href="/signup" class="text-primary underline underline-offset-4">Create an account</a></p>
  {/if}
  <p class="mt-6 text-sm"><a href="/reset-password" class="text-primary underline underline-offset-4">Use a different email</a></p>
  <p class="mt-6 text-sm"><a href="/login" class="text-primary underline underline-offset-4">Back to sign in</a></p>
</section>
