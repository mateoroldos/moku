<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import type { Organization } from '@moku/domain/organization';
  import * as AlertDialog from '@moku/ui/ui/alert-dialog';
  import { Button } from '@moku/ui/ui/button';
  import * as Field from '@moku/ui/ui/field';
  import { Input } from '@moku/ui/ui/input';
  import type { Schema } from 'effect';
  import { deleteOrganization } from './organizations.remote.ts';

  let { organization }: { organization: Schema.Codec.Encoded<typeof Organization> } = $props();

  let unconfirmed = $state<string>();
</script>

<section aria-labelledby="delete-organization" class="flex flex-col items-start gap-3 border-t pt-6">
  <h2 id="delete-organization" class="text-base font-medium">Delete organization</h2>
  <p class="text-sm text-muted-foreground">Deletes {organization.name}, all its tasks, and every member’s access. This can’t be undone.</p>
  <AlertDialog.Root onOpenChange={(open) => {
    if (!open) unconfirmed = undefined;
  }}>
    <AlertDialog.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="destructive" class="pointer-coarse:min-h-11">Delete organization…</Button>
      {/snippet}
    </AlertDialog.Trigger>
    <AlertDialog.Content escapeKeydownBehavior={deleteOrganization.pending > 0 ? 'ignore' : 'close'}>
      <form class="grid gap-4" {...deleteOrganization.enhance(async (submission) => {
        unconfirmed = undefined;

        try {
          await submission.submit();
        } catch (error) {
          // Page failures belong to the route boundary.
          if (isHttpError(error) && error.status < 500) throw error;
          if (!isHttpError(error)) console.error('Organization deletion request failed');
          unconfirmed = isHttpError(error) ? error.body.message : 'We couldn’t reach Moku. Check your connection and try again.';
        }
      })}>
        <input {...deleteOrganization.fields.organizationId.as('hidden', organization.id)} />
        <AlertDialog.Header>
          <AlertDialog.Title class="wrap-anywhere">Delete {organization.name}?</AlertDialog.Title>
          <AlertDialog.Description>This deletes all its tasks and removes every member’s access. It can’t be undone.</AlertDialog.Description>
        </AlertDialog.Header>
        <Field.Field data-invalid={!!deleteOrganization.fields.confirmation.issues()?.length}>
          <Field.Label for="delete-organization-confirmation" class="wrap-anywhere">Type {organization.name} to confirm</Field.Label>
          <Input {...deleteOrganization.fields.confirmation.as('text')} id="delete-organization-confirmation" autocomplete="off" required
            aria-invalid={!!deleteOrganization.fields.confirmation.issues()?.length} aria-describedby="delete-organization-errors"
            disabled={deleteOrganization.pending > 0} class="pointer-coarse:min-h-11" />
          <Field.Error id="delete-organization-errors" errors={deleteOrganization.fields.confirmation.issues() ?? []} />
        </Field.Field>
        <Field.Error errors={deleteOrganization.fields.issues() ?? []} />
        {#if unconfirmed}<Field.Error role="alert">{unconfirmed}</Field.Error>{/if}
        <AlertDialog.Footer>
          <AlertDialog.Cancel type="button" disabled={deleteOrganization.pending > 0}>Keep organization</AlertDialog.Cancel>
          <AlertDialog.Action type="submit" variant="destructive" disabled={deleteOrganization.pending > 0}>
            {deleteOrganization.pending > 0 ? 'Deleting…' : 'Delete organization'}
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </form>
    </AlertDialog.Content>
  </AlertDialog.Root>
</section>
