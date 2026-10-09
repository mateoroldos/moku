<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import { isHttpError } from '@sveltejs/kit';
  import { toast } from 'svelte-sonner';
  import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
  import type { OrganizationId } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import * as DropdownMenu from '@moku/ui/ui/dropdown-menu';
  import ConfirmAction from './ConfirmAction.svelte';
  import { removeMember } from './organizations.remote.ts';

  let { organizationId, member }: {
    organizationId: OrganizationId;
    member: { id: string; name: string; email: string };
  } = $props();

  const removal = $derived(removeMember.for(member.id));
  const formId = $derived(`remove-member-${member.id}`);
  let removing = $state(false);
  let failure = $state<string>();
  let refused = false;

  const close = () => {
    // A refusal means this page is stale; refreshing while the dialog was open could remove it.
    if (refused) void refreshAll();
    refused = false;
    failure = undefined;
  };
</script>

<form id={formId} {...removal.enhance(async (submission) => {
  failure = undefined;

  try {
    if (await submission.submit()) {
      // A redirect, such as to login, also settles the submission without a result.
      if (removal.result) toast.success(`${member.name} removed.`);
      return;
    }
    refused = true;
    failure = removal.fields.allIssues()?.[0]?.message ?? 'You can’t remove this member.';
  } catch (error) {
    // Page failures belong to the route boundary.
    if (isHttpError(error) && error.status < 500) throw error;
    if (!isHttpError(error)) console.error('Member removal request failed');
    failure = isHttpError(error) ? error.body.message : 'We couldn’t reach Moku. Check your connection and try again.';
  }
})}>
  <input {...removal.fields.organizationId.as('hidden', organizationId)} />
</form>

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
  pendingAction="Removing…" form={formId} pending={removal.pending > 0} {failure} onclose={close}>
  {#snippet description()}
    They lose access to this organization right away. Invite them again to restore it.
  {/snippet}
</ConfirmAction>
