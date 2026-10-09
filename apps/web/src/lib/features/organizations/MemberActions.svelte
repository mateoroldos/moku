<script lang="ts">
  import { toast } from 'svelte-sonner';
  import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
  import type { OrganizationId } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import * as DropdownMenu from '@moku/ui/ui/dropdown-menu';
  import { commandFailure } from './command-failure.ts';
  import ConfirmAction from './ConfirmAction.svelte';
  import { listOrganizationMembers, removeMember } from './organizations.remote.ts';

  let { organizationId, member }: {
    organizationId: OrganizationId;
    member: { id: string; name: string; email: string };
  } = $props();

  let removing = $state(false);

  /** Resolves to the failure to show in the dialog, or nothing once removed. */
  const remove = async () => {
    const failure = await commandFailure(
      removeMember({ organizationId, memberId: member.id }).updates(listOrganizationMembers(organizationId)),
    );
    if (!failure) toast.success(`${member.name} removed.`);

    return failure;
  };
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="icon" aria-label={`Actions for ${member.email}`}>
        <DotsThreeIcon weight="regular" aria-hidden="true" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-auto">
    <DropdownMenu.Group>
      <DropdownMenu.Item variant="destructive" onSelect={() => (removing = true)}>Remove member</DropdownMenu.Item>
    </DropdownMenu.Group>
  </DropdownMenu.Content>
</DropdownMenu.Root>

<ConfirmAction bind:open={removing} title={`Remove ${member.name}?`} cancel="Keep member" action="Remove member"
  pendingAction="Removing…" onconfirm={remove}>
  {#snippet description()}
    They lose access to this organization right away. Invite them again to restore it.
  {/snippet}
</ConfirmAction>
