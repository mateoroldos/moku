<script lang="ts">
  import RouteError from '#lib/features/navigation/RouteError.svelte';
  import OrganizationCreationRecovery from '#lib/features/organizations/OrganizationCreationRecovery.svelte';
</script>

<RouteError>
  {#snippet recovery(fallback)}
    <OrganizationCreationRecovery {fallback} />
  {/snippet}
</RouteError>
