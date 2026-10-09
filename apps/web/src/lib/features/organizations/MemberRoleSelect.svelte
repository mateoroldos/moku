<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import type { OrganizationId, OrganizationRole } from '@moku/domain/organization';
  import * as Select from '@moku/ui/ui/select';
  import { commandFailure } from './command-failure.ts';
  import ConfirmAction from './ConfirmAction.svelte';
  import { changeMemberRole, listOrganizationMembers } from './organizations.remote.ts';
  import { roleLabel } from './role-label.ts';

  let { organizationId, member, roles, self }: {
    organizationId: OrganizationId;
    member: { id: string; email: string; role: OrganizationRole };
    roles: ReadonlyArray<OrganizationRole>;
    self: boolean;
  } = $props();

  let selected = $derived<string>(member.role);
  const label = $derived(roleLabel(roles.find((role) => role === selected) ?? member.role));
  let pending = $state(false);
  /** Your own role change awaiting confirmation; the dialog is open while it exists. */
  let requested = $state<OrganizationRole>();

  /** Resolves to the failure to show, or nothing once the role changed. */
  const change = async (role: OrganizationRole) => {
    pending = true;
    const failure = await commandFailure(
      changeMemberRole({ organizationId, memberId: member.id, role }).updates(listOrganizationMembers(organizationId)),
    );
    pending = false;

    return failure;
  };

  const choose = async (value: string) => {
    const role = roles.find((option) => option === value);
    if (!role || role === member.role) return;
    // Changing your own role can remove permissions only someone else can restore.
    if (self) {
      requested = role;
      return;
    }

    const failure = await change(role);
    if (failure) {
      selected = member.role;
      toast.error(failure.message);
      if (failure.refused) await refreshAll();
    }
  };
</script>

<Select.Root type="single" bind:value={selected} onValueChange={choose} disabled={pending}>
  <Select.Trigger class="w-28" aria-label={`Role for ${member.email}`}>{label}</Select.Trigger>
  <Select.Content>
    <Select.Group>
      {#each roles as role (role)}
        <Select.Item value={role} label={roleLabel(role)} />
      {/each}
    </Select.Group>
  </Select.Content>
</Select.Root>

{#if requested}
  {@const role = requested}
  <ConfirmAction bind:open={() => true, (open) => { if (!open) requested = undefined; }} title="Change your own role?"
    cancel="Keep my role" action="Change my role" pendingAction="Changing…" onconfirm={() => change(role)}
    oncancel={() => (selected = member.role)}>
    {#snippet description()}
      Your role becomes {roleLabel(role)}. You may lose permissions you can’t restore yourself.
    {/snippet}
  </ConfirmAction>
{/if}
