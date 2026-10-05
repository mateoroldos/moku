<script lang="ts">
  import HumanTaskReview from '#lib/features/human-tasks/HumanTaskReview.svelte';
  import type { PageProps } from './$types';

  let { params, data }: PageProps = $props();
</script>

{#key `${data.viewer.userId}/${params.organizationId}/${params.id}`}
  <HumanTaskReview id={params.id} organizationId={data.organizationId} userId={data.viewer.userId} canRespondToHumanTasks={data.canRespondToHumanTasks} />
{/key}
