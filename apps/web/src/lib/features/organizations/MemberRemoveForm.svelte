<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import type { OrganizationId } from '@moku/domain/organization';
  import * as AlertDialog from '@moku/ui/ui/alert-dialog';
  import { Button } from '@moku/ui/ui/button';
  import * as Field from '@moku/ui/ui/field';
  import { listOrganizationMembers, removeMember } from './organizations.remote.ts';

  let { organizationId, member }: {
    organizationId: OrganizationId;
    member: { id: string; name: string; email: string };
  } = $props();

  const removal = $derived(removeMember.for(member.id));
  let unconfirmed = $state(false);
  let form = $state<HTMLFormElement>();
  let confirming = $state(false);
  let confirmed = false;

  const confirm = () => {
    confirmed = true;
    confirming = false;
    form?.requestSubmit();
  };

  const recheck = async () => {
    try {
      await listOrganizationMembers(organizationId).refresh();
      unconfirmed = false;
    } catch {
      console.error('Team members refresh failed');
    }
  };
</script>

<form bind:this={form} class="flex flex-col items-start gap-2 sm:items-end" aria-busy={removal.pending > 0} {...removal.enhance(async (submission) => {
  if (!confirmed) {
    confirming = true;
    return;
  }
  confirmed = false;
  unconfirmed = false;

  try {
    await submission.submit();
  } catch (error) {
    // Page failures belong to the route boundary; an unconfirmed outcome stays beside the row.
    if (isHttpError(error) && error.status < 500) throw error;
    if (!isHttpError(error)) console.error('Member removal request failed');
    unconfirmed = true;
  }
})}>
  <input {...removal.fields.organizationId.as('hidden', organizationId)} />
  <Button type="submit" variant="destructive" class="min-h-11" disabled={removal.pending > 0}
    aria-label={`Remove ${member.email}`}>{removal.pending > 0 ? 'Removing…' : 'Remove'}</Button>
  <Field.Error errors={removal.fields.issues() ?? []} />
  {#if unconfirmed}
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Field.Error role="alert">We couldn’t confirm the removal.</Field.Error>
      <Button variant="link" size="sm" onclick={recheck}>Refresh team</Button>
    </div>
  {/if}
</form>

<AlertDialog.Root bind:open={confirming}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title class="wrap-anywhere">Remove {member.name}?</AlertDialog.Title>
      <AlertDialog.Description>
        They lose access to this organization right away. Invite them again to restore it.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Keep member</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive" onclick={confirm}>Remove member</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
