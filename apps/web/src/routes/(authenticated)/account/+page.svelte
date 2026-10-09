<script lang="ts">
  import DeleteAccount from '#lib/features/auth/DeleteAccount.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Account · Moku</title>
</svelte:head>

<div class="flex flex-col gap-6">
  <h1 class="font-serif text-3xl tracking-tight">Account</h1>
  <DeleteAccount userId={data.viewer.userId} />
</div>
