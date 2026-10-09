<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import { isHttpError } from '@sveltejs/kit';
  import { toast } from 'svelte-sonner';
  import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
  import type { OrganizationId } from '@moku/domain/organization';
  import * as AlertDialog from '@moku/ui/ui/alert-dialog';
  import { Button } from '@moku/ui/ui/button';
  import * as DropdownMenu from '@moku/ui/ui/dropdown-menu';
  import * as Field from '@moku/ui/ui/field';
  import { removeMember } from './organizations.remote.ts';

  let { organizationId, member }: {
    organizationId: OrganizationId;
    member: { id: string; name: string; email: string };
  } = $props();

  const removal = $derived(removeMember.for(member.id));
  let removing = $state(false);
  let unconfirmed = $state<string>();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="icon" class="pointer-coarse:size-11" aria-label={`Actions for ${member.email}`}>
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

<AlertDialog.Root bind:open={removing} onOpenChange={(open) => {
  if (open) return;
  // A refusal means this page is stale; refreshing while the dialog was open could remove it.
  if (removal.fields.allIssues()?.length) void refreshAll();
  unconfirmed = undefined;
}}>
  <AlertDialog.Content escapeKeydownBehavior={removal.pending > 0 ? 'ignore' : 'close'}>
    <form class="grid gap-4" {...removal.enhance(async (submission) => {
      unconfirmed = undefined;

      try {
        // A redirect, such as to login, also settles the submission without a result.
        if (await submission.submit() && removal.result) toast.success(`${member.name} removed.`);
      } catch (error) {
        // Page failures belong to the route boundary.
        if (isHttpError(error) && error.status < 500) throw error;
        if (!isHttpError(error)) console.error('Member removal request failed');
        unconfirmed = isHttpError(error) ? error.body.message : 'We couldn’t reach Moku. Check your connection and try again.';
      }
    })}>
      <input {...removal.fields.organizationId.as('hidden', organizationId)} />
      <AlertDialog.Header>
        <AlertDialog.Title class="wrap-anywhere">Remove {member.name}?</AlertDialog.Title>
        <AlertDialog.Description>They lose access to this organization right away. Invite them again to restore it.</AlertDialog.Description>
      </AlertDialog.Header>
      <Field.Error errors={removal.fields.allIssues() ?? []} />
      {#if unconfirmed}<Field.Error role="alert">{unconfirmed}</Field.Error>{/if}
      <AlertDialog.Footer>
        <AlertDialog.Cancel type="button" disabled={removal.pending > 0}>Keep member</AlertDialog.Cancel>
        <AlertDialog.Action type="submit" variant="destructive" disabled={removal.pending > 0}>
          {removal.pending > 0 ? 'Removing…' : 'Remove member'}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </form>
  </AlertDialog.Content>
</AlertDialog.Root>
