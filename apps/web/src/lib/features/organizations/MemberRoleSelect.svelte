<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import { isHttpError } from '@sveltejs/kit';
  import { tick } from 'svelte';
  import { toast } from 'svelte-sonner';
  import type { OrganizationId, OrganizationRole } from '@moku/domain/organization';
  import * as Select from '@moku/ui/ui/select';
  import ConfirmAction from './ConfirmAction.svelte';
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
  let failure = $state<string>();
  let refused = false;

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

  /** Shows a failure in the open dialog, or as a toast with the select reverted. */
  const show = (message: string) => {
    if (requested) {
      failure = message;
      return;
    }
    selected = member.role;
    toast.error(message);
  };

  const close = () => {
    // A refusal means this page is stale; refreshing while the dialog was open could remove it.
    if (refused) void refreshAll();
    refused = false;
    failure = undefined;
    requested = undefined;
    selected = member.role;
  };
</script>

<form bind:this={form} id={formId} {...change.enhance(async (submission) => {
  failure = undefined;

  try {
    if (await submission.submit()) {
      requested = undefined;
      return;
    }
    refused = true;
    show(change.fields.allIssues()?.[0]?.message ?? 'You can’t change this member’s role.');
    if (!requested) close();
  } catch (error) {
    // Page failures belong to the route boundary.
    if (isHttpError(error) && error.status < 500) throw error;
    if (!isHttpError(error)) console.error('Member role change request failed');
    show(isHttpError(error) ? error.body.message : 'We couldn’t reach Moku. Check your connection and try again.');
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
  <ConfirmAction bind:open={() => true, (open) => { if (!open) close(); }} title="Change your own role?"
    cancel="Keep my role" action="Change my role" pendingAction="Changing…" form={formId}
    pending={change.pending > 0} {failure}>
    {#snippet description()}
      Your role becomes {roleLabel(role)}. You may lose permissions you can’t restore yourself.
    {/snippet}
  </ConfirmAction>
{/if}
