<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import PasswordConfirmationForm from '#lib/features/auth/PasswordConfirmationForm.svelte';

  let email = $derived(page.url.searchParams.get('email') ?? '');
</script>

<svelte:head><title>Reset password · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="reset-heading">
  <h1 id="reset-heading" class="font-serif text-4xl tracking-tight">Reset your password</h1>
  {#if email}
    {#key email}<PasswordConfirmationForm {email} />{/key}
    <p class="mt-6 text-sm"><a href="/reset-password" class="text-primary underline underline-offset-4">Use a different email</a></p>
  {:else}
  <p class="mt-3 text-sm text-muted-foreground">Use an email code to choose a new password or finish signup.</p>
  <form method="GET" action="/reset-password" class="mt-8">
    <Field.Group>
      <Field.Field>
        <Field.Label for="email">Email</Field.Label>
        <Input id="email" name="email" type="email" autocomplete="email" required />
      </Field.Field>
      <Button type="submit">Continue</Button>
    </Field.Group>
  </form>
  {/if}
  <p class="mt-6 text-sm"><a href="/login" class="text-primary underline underline-offset-4">Back to sign in</a></p>
</section>
