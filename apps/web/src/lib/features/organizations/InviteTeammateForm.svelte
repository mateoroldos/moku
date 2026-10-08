<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import type { OrganizationId } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import { inviteTeammate } from './organizations.remote.ts';

  let { organizationId }: { organizationId: OrganizationId } = $props();

  let notice = $state<{ role: 'status' | 'alert'; text: string } | null>(null);
</script>

<section aria-labelledby="invite-heading">
  <h2 id="invite-heading" class="text-lg font-medium">Invite a teammate</h2>
  <form class="mt-4" aria-busy={inviteTeammate.pending > 0} {...inviteTeammate.enhance(async (submission) => {
    const email = submission.fields.email.value();
    notice = null;

    try {
      if (!(await submission.submit())) return;

      if (inviteTeammate.result === 'invited') {
        notice = { role: 'status', text: `Invitation sent to ${email}.` };
        inviteTeammate.fields.email.set('');
      } else if (inviteTeammate.result === 'already-member') {
        notice = { role: 'alert', text: `${email} is already a member.` };
      } else if (inviteTeammate.result === 'limit-reached') {
        notice = { role: 'alert', text: 'This organization has too many pending invitations. Cancel some before inviting more.' };
      }
    } catch (failure) {
      if (isHttpError(failure, 403)) {
        notice = { role: 'alert', text: failure.body.message };
        return;
      }
      if (!isHttpError(failure)) console.error('Invitation request failed');
      notice = { role: 'alert', text: 'We couldn’t confirm the invitation. Check pending invitations before trying again.' };
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
      {#if notice?.role === 'alert'}
        <Field.Error role="alert">{notice.text}</Field.Error>
      {:else if notice}
        <p role="status" class="text-sm text-muted-foreground">{notice.text}</p>
      {/if}
      <Field.Field orientation="horizontal">
        <Button type="submit" disabled={inviteTeammate.pending > 0}>{inviteTeammate.pending > 0 ? 'Sending…' : 'Send invitation'}</Button>
      </Field.Field>
    </Field.Group>
  </form>
</section>
