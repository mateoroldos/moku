<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import type { OrganizationId } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import { inviteTeammate } from './organizations.remote.ts';
  import RoleSelect from './RoleSelect.svelte';

  let { organizationId }: { organizationId: OrganizationId } = $props();

  let unconfirmed = $state(false);
</script>

<section aria-labelledby="invite-heading">
  <h2 id="invite-heading" class="text-lg font-medium">Invite a teammate</h2>
  <form class="mt-4" aria-busy={inviteTeammate.pending > 0} {...inviteTeammate.enhance(async (submission) => {
    unconfirmed = false;

    try {
      if (await submission.submit()) inviteTeammate.fields.email.set('');
    } catch (error) {
      // Page failures belong to the route boundary; an unconfirmed outcome stays beside the form.
      if (isHttpError(error) && error.status < 500) throw error;
      if (!isHttpError(error)) console.error('Invitation request failed');
      unconfirmed = true;
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
        <Field.Field class="sm:w-40" data-invalid={!!inviteTeammate.fields.role.issues()?.length}>
          <Field.Label for="invite-role">Role</Field.Label>
          <RoleSelect {...inviteTeammate.fields.role.as('select', 'member')} id="invite-role"
            aria-invalid={!!inviteTeammate.fields.role.issues()?.length} aria-describedby="invite-role-errors"
            disabled={inviteTeammate.pending > 0} />
          <Field.Error id="invite-role-errors" errors={inviteTeammate.fields.role.issues() ?? []} />
        </Field.Field>
      </div>
      <Field.Error errors={inviteTeammate.fields.issues() ?? []} />
      {#if unconfirmed}
        <Field.Error role="alert">We couldn’t confirm the invitation. Check pending invitations before trying again.</Field.Error>
      {:else if inviteTeammate.result}
        <p role="status" class="text-sm text-muted-foreground">Invitation sent to {inviteTeammate.result.invited}.</p>
      {/if}
      <Field.Field orientation="horizontal">
        <Button type="submit" disabled={inviteTeammate.pending > 0}>{inviteTeammate.pending > 0 ? 'Sending…' : 'Send invitation'}</Button>
      </Field.Field>
    </Field.Group>
  </form>
</section>
