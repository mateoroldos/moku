<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import type { OrganizationId } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import { cancelInvitation, listInvitations } from './organizations.remote.ts';

  let { organizationId }: { organizationId: OrganizationId } = $props();

  const invitations = $derived(await listInvitations(organizationId));
  let failure = $state<string | null>(null);
</script>

<section aria-labelledby="pending-heading">
  <h2 id="pending-heading" class="text-lg font-medium">Pending invitations</h2>
  <ul aria-labelledby="pending-heading" class="mt-4 divide-y border-y">
    {#each invitations as invitation (invitation.id)}
      {@const cancel = cancelInvitation.for(invitation.id)}
      <li class="flex items-center justify-between gap-4 py-4">
        <div class="flex min-w-0 flex-col gap-1">
          <p class="wrap-anywhere text-sm">{invitation.email}</p>
          <p class="text-sm capitalize text-muted-foreground">{invitation.role}</p>
        </div>
        <form {...cancel.enhance(async (submission) => {
          failure = null;

          try {
            await submission.submit();
          } catch (error) {
            if (!isHttpError(error)) console.error('Invitation cancellation request failed');
            failure = isHttpError(error) && error.status !== 503 ? error.body.message : `We couldn’t cancel the invitation for ${invitation.email}. Try again.`;
          }
        })}>
          <Button type="submit" variant="outline" class="min-h-11" disabled={cancel.pending > 0}
            aria-label={`Cancel invitation for ${invitation.email}`}>{cancel.pending > 0 ? 'Cancelling…' : 'Cancel'}</Button>
        </form>
      </li>
    {:else}
      <li class="py-6 text-sm text-muted-foreground">No pending invitations.</li>
    {/each}
  </ul>
  {#if failure}<p role="alert" class="mt-3 text-sm text-destructive">{failure}</p>{/if}
</section>
