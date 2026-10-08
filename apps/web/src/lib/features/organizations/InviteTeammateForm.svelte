<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import type { OrganizationId } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import { inviteTeammate } from './organizations.remote.ts';

  let { organizationId }: { organizationId: OrganizationId } = $props();

  let failure = $state<string | null>(null);
</script>

<section aria-labelledby="invite-heading">
  <h2 id="invite-heading" class="text-lg font-medium">Invite a teammate</h2>
  <form class="mt-4" aria-busy={inviteTeammate.pending > 0} {...inviteTeammate.enhance(async (submission) => {
    failure = null;

    try {
      if (await submission.submit() && inviteTeammate.result?.outcome === 'invited') inviteTeammate.fields.email.set('');
    } catch (error) {
      if (!isHttpError(error)) console.error('Invitation request failed');
      failure = isHttpError(error, 403) ? error.body.message : 'We couldn’t confirm the invitation. Check pending invitations before trying again.';
    }
  })}>
    <input {...inviteTeammate.fields.organizationId.as('hidden', organizationId)} />
    <Field.Group>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Field.Field class="sm:flex-1" data-invalid={!!inviteTeammate.fields.email.issues()?.length}>
          <Field.Label for="invite-email">Email</Field.Label>
          <Input {...inviteTeammate.fields.email.as('email')} id="invite-email" autocomplete="off" required
            aria-invalid={!!inviteTeammate.fields.email.issues()?.length} aria-describedby="invite-email-errors"
            disabled={inviteTeammate.pending > 0} class="min-h-11" />
          <Field.Error id="invite-email-errors" errors={inviteTeammate.fields.email.issues() ?? []} />
        </Field.Field>
        <Field.Field class="sm:w-40">
          <Field.Label for="invite-role">Role</Field.Label>
          <select {...inviteTeammate.fields.role.as('select', 'member')} id="invite-role" disabled={inviteTeammate.pending > 0}
            class="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 min-h-11 w-full rounded-lg border bg-transparent px-2.5 text-base outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm">
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </Field.Field>
      </div>
      {#if failure}
        <Field.Error role="alert">{failure}</Field.Error>
      {:else if inviteTeammate.result?.outcome === 'invited'}
        <p role="status" class="text-sm text-muted-foreground">Invitation sent to {inviteTeammate.result.email}.</p>
      {:else if inviteTeammate.result?.outcome === 'already-member'}
        <Field.Error role="alert">{inviteTeammate.result.email} is already a member.</Field.Error>
      {:else if inviteTeammate.result?.outcome === 'limit-reached'}
        <Field.Error role="alert">This organization has too many pending invitations. Cancel some before inviting more.</Field.Error>
      {/if}
      <Field.Field orientation="horizontal">
        <Button type="submit" disabled={inviteTeammate.pending > 0}>{inviteTeammate.pending > 0 ? 'Sending…' : 'Send invitation'}</Button>
      </Field.Field>
    </Field.Group>
  </form>
</section>
