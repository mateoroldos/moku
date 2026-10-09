<script lang="ts">
  import { toast } from 'svelte-sonner';
  import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
  import type { OrganizationId } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import * as DropdownMenu from '@moku/ui/ui/dropdown-menu';
  import { commandFailure } from './command-failure.ts';
  import { cancelInvitation, listInvitations } from './organizations.remote.ts';

  let { organizationId }: { organizationId: OrganizationId } = $props();

  const invitations = $derived(await listInvitations(organizationId));

  const cancel = async ({ id, email }: { id: string; email: string }) => {
    const failure = await commandFailure(cancelInvitation({ id }).updates(listInvitations(organizationId)));

    if (failure) toast.error(failure.message);
    else toast.success(`Invitation for ${email} cancelled.`);
  };
</script>

<section aria-labelledby="pending-heading">
  <h2 id="pending-heading" class="text-lg font-medium">Pending invitations</h2>
  <ul aria-labelledby="pending-heading" class="mt-4 divide-y border-y">
    {#each invitations as invitation (invitation.id)}
      <li class="flex items-center justify-between gap-4 py-4">
        <div class="flex min-w-0 flex-col gap-1">
          <p class="wrap-anywhere text-sm">{invitation.email}</p>
          <p class="text-sm capitalize text-muted-foreground">{invitation.role}</p>
        </div>
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
              <DropdownMenu.Item onSelect={() => cancel(invitation)}>Cancel invitation</DropdownMenu.Item>
            </DropdownMenu.Group>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </li>
    {:else}
      <li class="py-6 text-sm text-muted-foreground">No pending invitations.</li>
    {/each}
  </ul>
</section>
