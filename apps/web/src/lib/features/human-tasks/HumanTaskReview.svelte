<script lang="ts">
  import { formatUtcDateTime } from "#lib/dates.ts";
  import ApprovalResponseForm from "./ApprovalResponseForm.svelte";
  import { getHumanTask } from "./human-tasks.remote";

  let { id, organizationId, canRespondToHumanTasks }: { id: string; organizationId: string; canRespondToHumanTasks: boolean } = $props();

  const task = $derived(await getHumanTask({ taskId: id, organizationId }));
</script>

<svelte:head>
  <title>{task.subject.title} · Moku</title>
</svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-8 sm:gap-10">
  <header class="flex flex-col gap-3">
    <span class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Approval request</span>
    <h1 class="wrap-anywhere font-serif text-3xl leading-tight tracking-tight sm:text-5xl">{task.subject.title}</h1>
    <p class="text-xs text-muted-foreground">
      Requested <time datetime={task.createdAt}>{formatUtcDateTime(task.createdAt)} UTC</time>
    </p>
  </header>

  {#if task.subject.description}
    <section aria-labelledby="subject-heading" class="rounded-xl border bg-card p-5 sm:p-8">
      <h2 id="subject-heading" class="mb-4 text-sm font-medium">What you’re authorizing</h2>
      <p class="whitespace-pre-wrap wrap-anywhere text-base leading-relaxed">{task.subject.description}</p>
    </section>
  {/if}

  {#if task.context}
    <section aria-labelledby="context-heading" class="flex flex-col gap-3">
      <h2 id="context-heading" class="text-sm font-medium">Context for your decision</h2>
      <p class="whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed text-muted-foreground">{task.context}</p>
    </section>
  {/if}

  {#if task.status === 'completed' || canRespondToHumanTasks}
    <ApprovalResponseForm {task} />
  {:else}
    <p class="text-sm text-muted-foreground">Your role allows viewing tasks, but not answering them.</p>
  {/if}
</div>
