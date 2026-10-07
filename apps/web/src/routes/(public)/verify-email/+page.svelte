<script lang="ts">
  import RequestVerificationForm from '#lib/features/auth/RequestVerificationForm.svelte';

  let email = $state<string | null>(null);
</script>

<svelte:head><title>Verify email · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="auth-heading">
  <h1 id="auth-heading" class="font-serif text-4xl tracking-tight">Verify your email</h1>
  <p class="mt-3 text-sm text-muted-foreground">Use the link in your email to verify your account, or request another below.</p>
  <RequestVerificationForm onrequested={(address) => { email = address; }} />
  {#if email}<p role="status" class="mt-4 text-sm text-muted-foreground">If <span class="break-all text-foreground">{email}</span> needs verification, check its inbox for a link.</p>{/if}
  <p class="mt-6 text-sm"><a href="/login" class="text-primary underline underline-offset-4">Back to sign in</a></p>
</section>
