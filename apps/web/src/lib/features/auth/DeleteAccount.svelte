<script lang="ts">
  import { goto } from '$app/navigation';
  import type { UserId } from '@moku/domain/identity';
  import * as AlertDialog from '@moku/ui/ui/alert-dialog';
  import { Button } from '@moku/ui/ui/button';
  import * as Field from '@moku/ui/ui/field';
  import { Input } from '@moku/ui/ui/input';
  import type { Schema } from 'effect';
  import { toast } from 'svelte-sonner';
  import { authClient } from '#lib/features/auth/client.ts';
  import { FeedbackDrafts } from '#lib/features/human-tasks/feedback-drafts.ts';

  let { userId }: { userId: Schema.Codec.Encoded<typeof UserId> } = $props();

  let open = $state(false);
  let password = $state('');
  let pending = $state(false);
  let passwordError = $state<string>();
  let message = $state<string>();

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (pending) return;

    pending = true;
    passwordError = undefined;
    message = undefined;

    try {
      const { error } = await authClient.deleteUser({ password });
      if (error?.code === 'INVALID_PASSWORD') {
        passwordError = 'Incorrect password.';
        return;
      }
      if (error) {
        // Better Auth's refusal names the organizations that need another owner.
        message = error.code === 'ORGANIZATION_OWNER_REQUIRED' && error.message ? error.message
          : error.status >= 500 ? 'We couldn’t confirm the deletion. Sign in to check before trying again.'
          : 'We couldn’t delete your account. Try again.';
        return;
      }
    } catch {
      console.error('Account deletion request failed');
      message = 'We couldn’t confirm the deletion. Sign in to check before trying again.';
      return;
    } finally {
      pending = false;
    }

    FeedbackDrafts.browser.clearUser(userId);
    toast.success('Account deleted.');
    await goto('/login', { refreshAll: true });
  };
</script>

<section aria-labelledby="delete-account" class="flex flex-col items-start gap-3 border-t pt-6">
  <h2 id="delete-account" class="text-base font-medium">Delete account</h2>
  <p class="text-sm text-muted-foreground">Deletes your account and signs you out everywhere. Organizations where you’re the only member are deleted with their tasks. This can’t be undone.</p>
  <AlertDialog.Root bind:open onOpenChange={(open) => {
    if (open) return;
    password = '';
    passwordError = undefined;
    message = undefined;
  }}>
    <AlertDialog.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="destructive" class="pointer-coarse:min-h-11">Delete account…</Button>
      {/snippet}
    </AlertDialog.Trigger>
    <AlertDialog.Content escapeKeydownBehavior={pending ? 'ignore' : 'close'}>
      <form method="POST" onsubmit={submit} class="grid gap-4" aria-busy={pending}>
        <AlertDialog.Header>
          <AlertDialog.Title>Delete your account?</AlertDialog.Title>
          <AlertDialog.Description>You lose access to every organization. Organizations where you’re the only member are deleted with their tasks.</AlertDialog.Description>
        </AlertDialog.Header>
        <Field.Field data-invalid={!!passwordError}>
          <Field.Label for="delete-account-password">Password</Field.Label>
          <Input bind:value={password} id="delete-account-password" type="password" autocomplete="current-password" required
            aria-invalid={!!passwordError} aria-describedby="delete-account-password-error" disabled={pending}
            class="pointer-coarse:min-h-11" />
          {#if passwordError}<Field.Error id="delete-account-password-error">{passwordError}</Field.Error>{/if}
        </Field.Field>
        {#if message}<Field.Error role="alert">{message}</Field.Error>{/if}
        <AlertDialog.Footer>
          <AlertDialog.Cancel type="button" disabled={pending}>Keep account</AlertDialog.Cancel>
          <AlertDialog.Action type="submit" variant="destructive" disabled={pending}>
            {pending ? 'Deleting…' : 'Delete account'}
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </form>
    </AlertDialog.Content>
  </AlertDialog.Root>
</section>
