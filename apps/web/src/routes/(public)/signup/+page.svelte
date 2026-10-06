<script lang="ts">
  import SignupForm from '#lib/features/auth/SignupForm.svelte';
</script>

<svelte:head><title>Create account · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="signup-heading">
  <h1 id="signup-heading" class="font-serif text-4xl tracking-tight">Create your account</h1>
  <p class="mt-3 text-sm text-muted-foreground">Confirm your email and password to create an organization and review tasks.</p>
  <SignupForm />
  <p class="mt-6 text-sm text-muted-foreground">Already have an account? <a href="/login" class="text-primary underline underline-offset-4">Sign in</a></p>
</section>
