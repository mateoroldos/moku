<script lang="ts">
  import { listOrganizationMembers } from '#lib/features/organizations/organizations.remote.ts';
  import InviteTeammateForm from '#lib/features/organizations/InviteTeammateForm.svelte';
  import PendingInvitations from '#lib/features/organizations/PendingInvitations.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const members = $derived(await listOrganizationMembers(data.organizationId));
</script>

<svelte:head>
  <title>Team · Moku</title>
</svelte:head>

<div class="flex flex-col gap-8 sm:gap-12">
  <h1 class="font-serif text-4xl tracking-tight sm:text-5xl">Team</h1>

  <ul aria-label="Team members" class="divide-y border-y">
    {#each members as member (member.userId)}
      <li class="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div class="flex min-w-0 flex-col gap-1">
          <p class="wrap-anywhere text-sm font-medium">
            {member.name}{#if member.userId === data.viewer.userId}<span class="text-muted-foreground">&nbsp;· You</span>{/if}
          </p>
          <p class="wrap-anywhere text-sm text-muted-foreground">{member.email}</p>
        </div>
        <p class="shrink-0 text-sm capitalize text-muted-foreground">{member.role}</p>
      </li>
    {:else}
      <li class="py-8 text-sm text-muted-foreground">No members to show.</li>
    {/each}
  </ul>

  {#if data.canManageInvitations}
    <InviteTeammateForm organizationId={data.organizationId} />
    <PendingInvitations organizationId={data.organizationId} />
  {/if}
</div>
