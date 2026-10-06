<script lang="ts">
  import CreateOrganizationForm from '#lib/features/organizations/CreateOrganizationForm.svelte';
</script>

<svelte:head><title>Create organization · Moku</title></svelte:head>

<section class="max-w-sm" aria-labelledby="create-heading">
  <h1 id="create-heading" class="font-serif text-4xl tracking-tight">Create organization</h1>
  <p class="mt-3 text-sm text-muted-foreground">A shared inbox for your team’s review tasks. You’ll be its owner.</p>
  <CreateOrganizationForm />
</section>
