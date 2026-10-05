<script lang="ts">
  import PublicLayout from '#lib/features/navigation/PublicLayout.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<PublicLayout>{@render children()}</PublicLayout>
