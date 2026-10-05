<script lang="ts">
  import PublicLayout from '#lib/features/navigation/PublicLayout.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<PublicLayout>{@render children()}</PublicLayout>
