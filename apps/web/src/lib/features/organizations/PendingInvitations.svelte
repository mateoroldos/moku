<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import { SvelteSet } from 'svelte/reactivity';
  import type { OrganizationId } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import * as Field from '@moku/ui/ui/field';
  import { cancelInvitation, listInvitations } from './organizations.remote.ts';

  let { organizationId }: { organizationId: OrganizationId } = $props();

  const invitations = $derived(await listInvitations(organizationId));
  // Each row keeps its own unresolved cancellation until it is retried or refreshed.
  const unconfirmed = new SvelteSet<string>();

  const recheck = async (id: string) => {
    try {
      await listInvitations(organizationId).refresh();
      unconfirmed.delete(id);
    } catch {
      console.error('Pending invitations refresh failed');
    }
  };
</script>

<section aria-labelledby="pending-heading">
  <h2 id="pending-heading" class="text-lg font-medium">Pending invitations</h2>
  <ul aria-labelledby="pending-heading" class="mt-4 divide-y border-y">
    {#each invitations as invitation (invitation.id)}
      {@const cancel = cancelInvitation.for(invitation.id)}
      <li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
        <div class="flex min-w-0 flex-col gap-1">
          <p class="wrap-anywhere text-sm">{invitation.email}</p>
          <p class="text-sm capitalize text-muted-foreground">{invitation.role}</p>
        </div>
        <form {...cancel.enhance(async (submission) => {
          unconfirmed.delete(invitation.id);

          try {
            await submission.submit();
          } catch (error) {
            if (isHttpError(error) && error.status < 500) throw error;
            if (!isHttpError(error)) console.error('Invitation cancellation request failed');
            unconfirmed.add(invitation.id);
          }
        })}>
          <Button type="submit" variant="outline" class="min-h-11" disabled={cancel.pending > 0}
            aria-label={`Cancel invitation for ${invitation.email}`}>{cancel.pending > 0 ? 'Cancelling…' : 'Cancel'}</Button>
        </form>
        {#if unconfirmed.has(invitation.id)}
          <div class="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
            <Field.Error role="alert">We couldn’t confirm the cancellation for {invitation.email}.</Field.Error>
            <Button variant="link" size="sm" onclick={() => recheck(invitation.id)}>Refresh pending invitations</Button>
          </div>
        {/if}
      </li>
    {:else}
      <li class="py-6 text-sm text-muted-foreground">No pending invitations.</li>
    {/each}
  </ul>
</section>
