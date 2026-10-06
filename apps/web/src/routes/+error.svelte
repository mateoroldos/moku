<script lang="ts">
  import PublicLayout from '#lib/features/navigation/PublicLayout.svelte';
  import RouteError from '#lib/features/navigation/RouteError.svelte';
  import OrganizationCreationRecovery from '#lib/features/organizations/OrganizationCreationRecovery.svelte';
</script>

<PublicLayout>
  <RouteError>
    {#snippet recovery(fallback)}
      <OrganizationCreationRecovery {fallback} />
    {/snippet}
  </RouteError>
</PublicLayout>
