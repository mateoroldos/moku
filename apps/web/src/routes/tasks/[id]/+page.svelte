<script lang="ts">
  import HumanTaskReview from '../../../lib/features/human-tasks/HumanTaskReview.svelte';
  import type { PageProps } from './$types';

  let { params }: PageProps = $props();
</script>

{#key params.id}
  <HumanTaskReview id={params.id} />
{/key}
