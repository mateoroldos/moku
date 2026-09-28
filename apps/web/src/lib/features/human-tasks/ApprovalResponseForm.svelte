<script lang="ts">
  import { Button } from "@moku/ui/ui/button";
  import { isHttpError } from "@sveltejs/kit";
  import CheckIcon from "phosphor-svelte/lib/CheckIcon";
  import XIcon from "phosphor-svelte/lib/XIcon";
  import ApprovalAnswer from "./ApprovalAnswer.svelte";
  import { getHumanTask, respondToHumanTask } from "./human-tasks.remote";
  import type { ReviewTask } from "./review-task";

  let { task }: { task: ReviewTask } = $props();
  const query = $derived(getHumanTask(task.id));
  const response = $derived(respondToHumanTask.for(task.id));
  let submissionFailed = $state(false);
</script>

<section aria-label="Your response" class="border-t pt-6 sm:pt-8">
  {#if task.status === "completed"}
    {#if response.result === "already-completed"}
      <p class="mb-5 rounded-lg border bg-muted p-4 text-sm" role="status">
        This task was already completed. Your response was not recorded. The recorded decision is shown below.
      </p>
    {/if}
    <ApprovalAnswer {task} />
  {:else}
    {#if task.status === "submitting"}
      <ApprovalAnswer {task} />
    {/if}

    <div hidden={task.status === "submitting"}>
      <h2 id="draft-heading" class="text-lg font-medium">Your decision</h2>
      <p class="mt-2 text-sm leading-relaxed text-muted-foreground">Review the request before responding. Your first response is final; recording it does not execute the action.</p>
      <form class="mt-6 flex flex-col gap-5" {...response.enhance(async (submission) => {
        submissionFailed = false;
        try {
          const decision = submission.fields.decision.value();
          if (decision !== "approved" && decision !== "rejected") {
            await submission.submit();
            return;
          }
          const answer = { decision, feedback: submission.fields.feedback.value() ?? "" };
          await submission.submit().updates(query.withOverride((current) =>
            current.status === "pending" ? { ...current, status: "submitting", answer } : current
          ));
        } catch (failure) {
          if (isHttpError(failure, 403) || isHttpError(failure, 404)) throw failure;
          if (!isHttpError(failure)) {
            // oxlint-disable-next-line effecttsgo/global-console -- Locally handled failures do not reach Kit's error hook.
            console.error(failure);
          }
          submissionFailed = true;
        }
      })}>
        <input {...response.fields.id.as("hidden", task.id)} />
        <div class="flex flex-col gap-2">
          <label for="feedback" class="text-sm font-medium">Feedback <span class="font-normal text-muted-foreground">(optional)</span></label>
          <textarea {...response.fields.feedback.as("text")} id="feedback" rows="4" aria-describedby="feedback-hint" disabled={response.pending > 0}
            class="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"></textarea>
          <p id="feedback-hint" class="text-xs text-muted-foreground">Explain your decision or what would need to change.</p>
        </div>
        {#if response.fields.allIssues()?.length}
          <p role="alert" class="text-sm text-destructive">The response is invalid. Refresh the task and choose Approve or Reject.</p>
        {/if}
        {#if submissionFailed}
          <div class="flex flex-col items-start gap-2">
            <p role="alert" class="text-sm text-destructive">We couldn’t confirm your response. Reload to check the task’s status.</p>
            <Button href="/tasks/{task.id}" variant="outline" data-sveltekit-reload>Reload task</Button>
            <p class="text-xs text-muted-foreground">Reloading clears unsaved feedback.</p>
          </div>
        {/if}
        <div class="flex flex-col gap-3 sm:flex-row">
          <Button {...response.fields.decision.as("submit", "approved")} disabled={response.pending > 0} class="min-h-11 px-5">
            <CheckIcon weight="regular" aria-hidden="true" /> Approve
          </Button>
          <Button {...response.fields.decision.as("submit", "rejected")} variant="outline" disabled={response.pending > 0} class="min-h-11 px-5">
            <XIcon weight="regular" aria-hidden="true" /> Reject
          </Button>
        </div>
      </form>
    </div>
  {/if}
</section>
