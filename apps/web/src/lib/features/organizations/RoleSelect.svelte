<script lang="ts">
  import type { HTMLSelectAttributes } from 'svelte/elements';
  import type { OrganizationRole } from '@moku/domain/organization';

  let { roles, ...props }: HTMLSelectAttributes & { roles: ReadonlyArray<OrganizationRole> } = $props();

  const options: ReadonlyArray<[OrganizationRole, string]> = [
    ['member', 'Member'],
    ['viewer', 'Viewer'],
    ['admin', 'Admin'],
    ['owner', 'Owner'],
  ];
</script>

<!-- shadcn-svelte's native select fixes its height below the 44px touch target. -->
<select {...props}
  class="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:bg-input/50 min-h-11 w-full rounded-lg border bg-transparent px-2.5 text-base outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm">
  {#each options as [value, label] (value)}
    {#if roles.includes(value)}<option {value}>{label}</option>{/if}
  {/each}
</select>
