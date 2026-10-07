<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import SignupForm from '#lib/features/auth/SignupForm.svelte';

  let email = $state<string | null>(null);
  let heading: HTMLHeadingElement;
  let active = true;

  onDestroy(() => { active = false; });

  const created = async (address: string) => {
    if (!active) return;

    email = address;
    await tick();
    heading?.focus();
  };
</script>

<svelte:head><title>Create your account · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="auth-heading">
  <h1 id="auth-heading" bind:this={heading} tabindex="-1" class="font-serif text-4xl tracking-tight">{email ? 'Check your email' : 'Create your account'}</h1>
  {#if email}
    <p class="mt-3 text-sm text-muted-foreground">Check <span class="break-all text-foreground">{email}</span> for a verification link. If you already have an account, sign in or reset your password.</p>
    <p class="mt-6 text-sm"><a href="/verify-email" class="text-primary underline underline-offset-4">Request another link</a></p>
  {:else}
    <SignupForm oncreated={created} />
  {/if}
  <p class="mt-6 text-sm text-muted-foreground">Already have an account? <a href="/login" class="text-primary underline underline-offset-4">Sign in</a></p>
</section>
