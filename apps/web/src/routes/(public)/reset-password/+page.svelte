<script lang="ts">
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
</script>

<svelte:head><title>Reset password · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="reset-heading">
  <h1 id="reset-heading" class="font-serif text-4xl tracking-tight">Reset your password</h1>
  <p class="mt-3 text-sm text-muted-foreground">Use an email code to choose a new password or finish signup.</p>
  <form method="GET" action="/verify-email" class="mt-8">
    <Field.Group>
      <Field.Field>
        <Field.Label for="email">Email</Field.Label>
        <Input id="email" name="email" type="email" autocomplete="email" required />
      </Field.Field>
      <Button type="submit">Continue</Button>
    </Field.Group>
  </form>
  <p class="mt-6 text-sm"><a href="/login" class="text-primary underline underline-offset-4">Back to sign in</a></p>
</section>
