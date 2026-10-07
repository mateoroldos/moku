<script lang="ts">
  import RequestResetForm from '#lib/features/auth/RequestResetForm.svelte';

  let email = $state<string | null>(null);
</script>

<svelte:head><title>Forgot password · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="auth-heading">
  <h1 id="auth-heading" class="font-serif text-4xl tracking-tight">Forgot your password?</h1>
  <p class="mt-3 text-sm text-muted-foreground">We’ll email you a link to reset your password.</p>
  <RequestResetForm onrequested={(address) => { email = address; }} />
  {#if email}<p role="status" class="mt-4 text-sm text-muted-foreground">If an account exists for <span class="break-all text-foreground">{email}</span>, check its inbox for a reset link.</p>{/if}
  <p class="mt-6 text-sm"><a href="/login" class="text-primary underline underline-offset-4">Back to sign in</a></p>
</section>
