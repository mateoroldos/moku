<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import type { OrganizationId, OrganizationRole } from '@moku/domain/organization';
  import * as AlertDialog from '@moku/ui/ui/alert-dialog';
  import { Button } from '@moku/ui/ui/button';
  import * as Field from '@moku/ui/ui/field';
  import { changeMemberRole, listOrganizationMembers } from './organizations.remote.ts';
  import RoleSelect from './RoleSelect.svelte';

  let { organizationId, member, self }: {
    organizationId: OrganizationId;
    member: { id: string; email: string; role: OrganizationRole };
    self: boolean;
  } = $props();

  const change = $derived(changeMemberRole.for(member.id));
  const errorsId = $derived(`member-role-errors-${member.id}`);
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

<form bind:this={form} class="flex flex-col gap-2 sm:items-end" aria-busy={change.pending > 0} {...change.enhance(async (submission) => {
  // Changing your own role can remove permissions only someone else can restore.
  if (self && !confirmed && change.fields.role.value() !== member.role) {
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
    if (!isHttpError(error)) console.error('Member role change request failed');
    unconfirmed = true;
  }
})}>
  <input {...change.fields.organizationId.as('hidden', organizationId)} />
  <div class="flex items-center gap-2">
    <div class="w-32">
      <RoleSelect {...change.fields.role.as('select', member.role)} aria-label={`Role for ${member.email}`}
        aria-invalid={!!change.fields.role.issues()?.length} aria-describedby={errorsId} disabled={change.pending > 0} />
    </div>
    <Button type="submit" variant="outline" class="min-h-11" disabled={change.pending > 0}
      aria-label={`Save role for ${member.email}`}>{change.pending > 0 ? 'Saving…' : 'Save'}</Button>
  </div>
  <Field.Error id={errorsId} errors={change.fields.role.issues() ?? []} />
  {#if unconfirmed}
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Field.Error role="alert">We couldn’t confirm the role change.</Field.Error>
      <Button variant="link" size="sm" onclick={recheck}>Refresh team</Button>
    </div>
  {:else if change.result}
    <p role="status" class="text-sm text-muted-foreground">Role updated.</p>
  {/if}
</form>

<AlertDialog.Root bind:open={confirming}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Change your own role?</AlertDialog.Title>
      <AlertDialog.Description>
        Your role becomes <span class="capitalize">{change.fields.role.value()}</span>. You may lose permissions you can’t restore yourself.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Keep my role</AlertDialog.Cancel>
      <AlertDialog.Action onclick={confirm}>Change my role</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
