<script lang="ts">
  import * as Table from '@moku/ui/ui/table';
  import { listOrganizationMembers } from '#lib/features/organizations/organizations.remote.ts';
  import InvitedRows from '#lib/features/organizations/InvitedRows.svelte';
  import InviteTeammateDialog from '#lib/features/organizations/InviteTeammateDialog.svelte';
  import MemberActions from '#lib/features/organizations/MemberActions.svelte';
  import MemberRoleSelect from '#lib/features/organizations/MemberRoleSelect.svelte';
  import { roleLabel } from '#lib/features/organizations/role-label.ts';
  import TeamGroupRow from '#lib/features/organizations/TeamGroupRow.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const members = $derived(await listOrganizationMembers(data.organizationId));
</script>

<svelte:head>
  <title>Team · Moku</title>
</svelte:head>

<div class="flex flex-col gap-6">
  <div class="flex items-center justify-between gap-4">
    <h1 class="font-serif text-3xl tracking-tight">Team</h1>
    {#if data.invitationRoles.length > 0}
      <InviteTeammateDialog organizationId={data.organizationId} roles={data.invitationRoles} />
    {/if}
  </div>

  <Table.Root aria-label="Team members">
    <Table.Header>
      <Table.Row>
        <Table.Head>Name</Table.Head>
        <Table.Head>Role</Table.Head>
        <Table.Head><span class="sr-only">Actions</span></Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      <TeamGroupRow label="Members" count={members.length} />
      {#each members as member (member.id)}
        {@const self = member.userId === data.viewer.userId}
        {@const manageable = data.memberRoles.includes(member.role)}
        <Table.Row>
          <Table.Cell class="whitespace-normal">
            <p class="wrap-anywhere text-sm font-medium">
              {member.name}{#if self}<span class="font-normal text-muted-foreground">&nbsp;· You</span>{/if}
            </p>
            <p class="wrap-anywhere text-xs text-muted-foreground">{member.email}</p>
          </Table.Cell>
          <Table.Cell>
            {#if manageable}
              <MemberRoleSelect organizationId={data.organizationId} {member} roles={data.memberRoles} {self} />
            {:else}
              <span class="text-muted-foreground">{roleLabel(member.role)}</span>
            {/if}
          </Table.Cell>
          <Table.Cell class="text-right">
            {#if manageable && !self}
              <MemberActions organizationId={data.organizationId} {member} />
            {/if}
          </Table.Cell>
        </Table.Row>
      {:else}
        <Table.Row>
          <Table.Cell colspan={3}><span class="text-muted-foreground">No members to show.</span></Table.Cell>
        </Table.Row>
      {/each}
      {#if data.invitationRoles.length > 0}
        <InvitedRows organizationId={data.organizationId} />
      {/if}
    </Table.Body>
  </Table.Root>
</div>
