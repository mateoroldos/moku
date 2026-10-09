<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import { isHttpError } from '@sveltejs/kit';
  import { tick } from 'svelte';
  import { toast } from 'svelte-sonner';
  import type { OrganizationId, OrganizationRole } from '@moku/domain/organization';
  import * as AlertDialog from '@moku/ui/ui/alert-dialog';
  import * as Field from '@moku/ui/ui/field';
  import * as Select from '@moku/ui/ui/select';
  import { changeMemberRole } from './organizations.remote.ts';
  import { roleLabel } from './role-label.ts';

  let { organizationId, member, roles, self }: {
    organizationId: OrganizationId;
    member: { id: string; email: string; role: OrganizationRole };
    roles: ReadonlyArray<OrganizationRole>;
    self: boolean;
  } = $props();

  const change = $derived(changeMemberRole.for(member.id));
  const formId = $derived(`member-role-${member.id}`);
  let form = $state<HTMLFormElement>();
  let selected = $derived<string>(member.role);
  const label = $derived(roleLabel(roles.find((role) => role === selected) ?? member.role));
  /** Your own role change awaiting confirmation; the dialog is open while it exists. */
  let requested = $state<OrganizationRole>();
  let unconfirmed = $state<string>();

  const choose = async (value: string) => {
    const role = roles.find((option) => option === value);
    if (!role || role === member.role) return;
    // Changing your own role can remove permissions only someone else can restore.
    if (self) {
      requested = role;
      return;
    }

    // Let the select's hidden input take the new value before submitting.
    await tick();
    form?.requestSubmit();
  };

  const close = () => {
    // A refusal means this page is stale; refreshing while the dialog was open could remove it.
    if (change.fields.allIssues()?.length) void refreshAll();
    unconfirmed = undefined;
    requested = undefined;
    selected = member.role;
  };
</script>

<form bind:this={form} id={formId} {...change.enhance(async (submission) => {
  unconfirmed = undefined;

  try {
    if (await submission.submit()) {
      requested = undefined;
      return;
    }
    // The open dialog shows the refusal itself.
    if (requested) return;
    toast.error(change.fields.allIssues()?.[0]?.message ?? 'You can’t change this member’s role.');
    close();
  } catch (error) {
    // Page failures belong to the route boundary.
    if (isHttpError(error) && error.status < 500) throw error;
    if (!isHttpError(error)) console.error('Member role change request failed');
    const message = isHttpError(error) ? error.body.message : 'We couldn’t reach Moku. Check your connection and try again.';
    if (requested) unconfirmed = message;
    else {
      selected = member.role;
      toast.error(message);
    }
  }
})}>
  <input {...change.fields.organizationId.as('hidden', organizationId)} />
  <Select.Root type="single" name={change.fields.role.as('select').name} bind:value={selected} onValueChange={choose}
    disabled={change.pending > 0}>
    <Select.Trigger class="w-28" aria-label={`Role for ${member.email}`}>{label}</Select.Trigger>
    <Select.Content>
      <Select.Group>
        {#each roles as role (role)}
          <Select.Item value={role} label={roleLabel(role)} />
        {/each}
      </Select.Group>
    </Select.Content>
  </Select.Root>
</form>

{#if requested}
  {@const role = requested}
  <AlertDialog.Root bind:open={() => true, (open) => { if (!open) close(); }}>
    <AlertDialog.Content escapeKeydownBehavior={change.pending > 0 ? 'ignore' : 'close'}>
      <AlertDialog.Header>
        <AlertDialog.Title>Change your own role?</AlertDialog.Title>
        <AlertDialog.Description>
          Your role becomes {roleLabel(role)}. You may lose permissions you can’t restore yourself.
        </AlertDialog.Description>
      </AlertDialog.Header>
      <Field.Error errors={change.fields.allIssues() ?? []} />
      {#if unconfirmed}<Field.Error role="alert">{unconfirmed}</Field.Error>{/if}
      <AlertDialog.Footer>
        <AlertDialog.Cancel disabled={change.pending > 0}>Keep my role</AlertDialog.Cancel>
        <!-- The dialog renders outside the row's form; `form` submits it. -->
        <AlertDialog.Action type="submit" form={formId} variant="destructive" disabled={change.pending > 0}>
          {change.pending > 0 ? 'Changing…' : 'Change my role'}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}
