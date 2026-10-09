<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import { toast } from 'svelte-sonner';
  import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
  import type { OrganizationId } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import * as DropdownMenu from '@moku/ui/ui/dropdown-menu';
  import { cancelInvitation, listInvitations } from './organizations.remote.ts';

  let { organizationId }: { organizationId: OrganizationId } = $props();

  const invitations = $derived(await listInvitations(organizationId));
</script>

<section aria-labelledby="pending-heading">
  <h2 id="pending-heading" class="text-lg font-medium">Pending invitations</h2>
  <ul aria-labelledby="pending-heading" class="mt-4 divide-y border-y">
    {#each invitations as invitation (invitation.id)}
      {@const cancel = cancelInvitation.for(invitation.id)}
      {@const formId = `cancel-invitation-${invitation.id}`}
      <li class="flex items-center justify-between gap-4 py-4">
        <div class="flex min-w-0 flex-col gap-1">
          <p class="wrap-anywhere text-sm">{invitation.email}</p>
          <p class="text-sm capitalize text-muted-foreground">{invitation.role}</p>
        </div>
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
              <Button {...props} variant="ghost" size="icon" aria-label={`Actions for invitation to ${invitation.email}`}>
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
      </li>
    {:else}
      <li class="py-6 text-sm text-muted-foreground">No pending invitations.</li>
    {/each}
  </ul>
</section>
