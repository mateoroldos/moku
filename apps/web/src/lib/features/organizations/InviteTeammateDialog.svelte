<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import { toast } from 'svelte-sonner';
  import type { OrganizationId, OrganizationRole } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import * as Dialog from '@moku/ui/ui/dialog';
  import * as Field from '@moku/ui/ui/field';
  import { Input } from '@moku/ui/ui/input';
  import * as Select from '@moku/ui/ui/select';
  import { inviteTeammate } from './organizations.remote.ts';
  import { roleLabel } from './role-label.ts';

  let { organizationId, roles }: {
    organizationId: OrganizationId;
    roles: ReadonlyArray<OrganizationRole>;
  } = $props();

  let open = $state(false);
  let role = $state<string>('member');
  let unconfirmed = $state(false);
  const roleField = $derived(inviteTeammate.fields.role.as('select'));
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>
    {#snippet child({ props })}
      <Button {...props} class="pointer-coarse:min-h-11">Invite</Button>
    {/snippet}
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Invite a teammate</Dialog.Title>
      <Dialog.Description>They get an email with a link to join.</Dialog.Description>
    </Dialog.Header>
    <form aria-busy={inviteTeammate.pending > 0} {...inviteTeammate.enhance(async (submission) => {
      unconfirmed = false;

      try {
        if (!(await submission.submit())) return;

        toast.success(`Invitation sent to ${inviteTeammate.result?.invited}.`);
        inviteTeammate.fields.email.set('');
        open = false;
      } catch (error) {
        // Page failures belong to the route boundary; an unconfirmed outcome stays in the dialog.
        if (isHttpError(error) && error.status < 500) throw error;
        if (!isHttpError(error)) console.error('Invitation request failed');
        unconfirmed = true;
      }
    })}>
      <input {...inviteTeammate.fields.organizationId.as('hidden', organizationId)} />
      <Field.Group>
        <Field.Field data-invalid={!!inviteTeammate.fields.email.issues()?.length}>
          <Field.Label for="invite-email">Email</Field.Label>
          <Input {...inviteTeammate.fields.email.as('email')} id="invite-email" autocomplete="off" required
            aria-invalid={!!inviteTeammate.fields.email.issues()?.length} aria-describedby="invite-email-errors"
            disabled={inviteTeammate.pending > 0} class="pointer-coarse:min-h-11" />
          <Field.Error id="invite-email-errors" errors={inviteTeammate.fields.email.issues() ?? []} />
        </Field.Field>
        <Field.Field data-invalid={!!inviteTeammate.fields.role.issues()?.length}>
          <Field.Label for="invite-role">Role</Field.Label>
          <Select.Root type="single" name={roleField.name} bind:value={role} disabled={inviteTeammate.pending > 0}>
            <Select.Trigger id="invite-role" class="w-full pointer-coarse:min-h-11"
              aria-invalid={!!inviteTeammate.fields.role.issues()?.length} aria-describedby="invite-role-errors">
              {roleLabel(roles.find((option) => option === role) ?? 'member')}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each roles as option (option)}
                  <Select.Item value={option} label={roleLabel(option)} />
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
          <Field.Error id="invite-role-errors" errors={inviteTeammate.fields.role.issues() ?? []} />
        </Field.Field>
        <Field.Error errors={inviteTeammate.fields.issues() ?? []} />
        {#if unconfirmed}
          <Field.Error role="alert">We couldn’t confirm the invitation. Check pending invitations before trying again.</Field.Error>
        {/if}
      </Field.Group>
      <Dialog.Footer class="mt-6">
        <Button type="submit" class="pointer-coarse:min-h-11" disabled={inviteTeammate.pending > 0}>
          {inviteTeammate.pending > 0 ? 'Sending…' : 'Send invitation'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
