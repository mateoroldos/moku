<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import { toast } from 'svelte-sonner';
  import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
  import type { OrganizationId } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import * as DropdownMenu from '@moku/ui/ui/dropdown-menu';
  import * as Table from '@moku/ui/ui/table';
  import { cancelInvitation, listInvitations } from './organizations.remote.ts';
  import { roleLabel } from './role-label.ts';
  import TeamGroupRow from './TeamGroupRow.svelte';

  let { organizationId }: { organizationId: OrganizationId } = $props();

  const invitations = $derived(await listInvitations(organizationId));
</script>

{#if invitations.length > 0}
  <TeamGroupRow label="Invited" count={invitations.length} />
  {#each invitations as invitation (invitation.id)}
    {@const cancel = cancelInvitation.for(invitation.id)}
    {@const formId = `cancel-invitation-${invitation.id}`}
    <Table.Row>
      <Table.Cell class="whitespace-normal">
        <p class="wrap-anywhere text-sm">{invitation.email}</p>
      </Table.Cell>
      <Table.Cell><span class="text-muted-foreground">{roleLabel(invitation.role)}</span></Table.Cell>
      <Table.Cell class="text-right">
        <form id={formId} {...cancel.enhance(async (submission) => {
          try {
            // A redirect, such as to login, also settles the submission without a result.
            if (await submission.submit() && cancel.result) toast.success(`Invitation for ${invitation.email} cancelled.`);
          } catch (error) {
            // Page failures belong to the route boundary.
            if (isHttpError(error) && error.status < 500) throw error;
            if (!isHttpError(error)) console.error('Invitation cancellation request failed');
            toast.error(isHttpError(error) ? error.body.message : 'We couldn’t reach Moku. Check your connection and try again.');
          }
        })}></form>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="icon" class="pointer-coarse:size-11"
                aria-label={`Actions for invitation to ${invitation.email}`}>
                <DotsThreeIcon weight="regular" aria-hidden="true" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-auto">
            <DropdownMenu.Group>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <button {...props} type="submit" form={formId}>Cancel invitation</button>
                {/snippet}
              </DropdownMenu.Item>
            </DropdownMenu.Group>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Table.Cell>
    </Table.Row>
  {/each}
{/if}
