<script lang="ts">
  import CheckIcon from "phosphor-svelte/lib/CheckIcon";
  import XIcon from "phosphor-svelte/lib/XIcon";
  import { formatUtcDateTime } from "../../dates";
  import type { ReviewTask } from "./review-task";

  let { task }: { task: Exclude<ReviewTask, { status: "pending" }> } = $props();
  const answer = $derived(task.status === "completed" ? task.result : task.answer);
</script>

<div class="flex flex-col gap-4" role="status">
  <div class="flex items-center gap-3">
    <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
      {#if answer.decision === "approved"}
        <CheckIcon weight="regular" class="size-5" aria-hidden="true" />
      {:else}
        <XIcon weight="regular" class="size-5" aria-hidden="true" />
      {/if}
    </div>
    <div>
      <h2 id="decision-heading" class="text-lg font-medium">
        {answer.decision === "approved" ? "Approval" : "Rejection"}{task.status === "completed" ? " recorded" : ""}
      </h2>
      <p class="text-xs text-muted-foreground">
        {#if task.status === "completed"}
          <time datetime={task.completedAt}>{formatUtcDateTime(task.completedAt)} UTC</time>
        {:else}
          Saving…
        {/if}
      </p>
    </div>
  </div>
  {#if answer.feedback}
    <div class="rounded-lg border bg-card p-4">
      <h3 class="mb-2 text-sm font-medium">{task.status === "completed" ? "Recorded feedback" : "Your feedback"}</h3>
      <p class="whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed">{answer.feedback}</p>
    </div>
  {/if}
  <p class="text-sm leading-relaxed text-muted-foreground">This records a decision only. Moku does not execute the action.</p>
</div>
