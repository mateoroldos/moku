<script lang="ts">
  import TrayIcon from 'phosphor-svelte/lib/TrayIcon';
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
  import { listHumanTasks } from '#lib/features/human-tasks/human-tasks.remote.ts';
  import { formatUtcDateTime } from '#lib/dates.ts';

  const tasks = $derived(await listHumanTasks());
  const groups = $derived([
    { title: 'Awaiting your decision', empty: 'No tasks awaiting your decision.', tasks: tasks.filter((task) => task.status === 'pending') },
    { title: 'Recorded decisions', empty: 'No decisions recorded yet.', tasks: tasks.filter((task) => task.status === 'completed') },
  ]);
</script>

<svelte:head>
  <title>Inbox · Moku</title>
</svelte:head>

<div class="flex flex-col gap-8 sm:gap-12">
  <div class="flex flex-col gap-3">
    <h1 class="font-serif text-4xl tracking-tight sm:text-5xl">Room for human judgment.</h1>
    <p class="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
      A place to review what your agents need from you.
    </p>
  </div>

  {#if tasks.length === 0}
    <section aria-labelledby="inbox-heading" class="overflow-hidden rounded-xl border bg-card">
      <div class="border-b px-5 py-4 sm:px-6">
        <h2 id="inbox-heading" class="text-sm font-medium">Inbox</h2>
      </div>
      <div class="flex flex-col items-center gap-4 px-6 py-20 text-center sm:py-28">
        <div class="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <TrayIcon class="size-5" weight="regular" aria-hidden="true" />
        </div>
        <div class="flex max-w-sm flex-col gap-2">
          <h3 class="text-base font-medium">No tasks yet</h3>
          <p class="text-sm leading-relaxed text-muted-foreground">
            Requests that need your review will appear here.
          </p>
        </div>
      </div>
    </section>
  {:else}
    {#each groups as group (group.title)}
      <section aria-label={group.title} class="overflow-hidden rounded-xl border bg-card">
        <div class="flex items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <h2 class="text-sm font-medium">{group.title}</h2>
          <span class="font-mono text-xs text-muted-foreground">{group.tasks.length}</span>
        </div>
        <ul class="divide-y">
          {#each group.tasks as task (task.id)}
            <li>
              <a href="/tasks/{task.id}" class="flex items-center gap-4 px-5 py-5 outline-none hover:bg-muted/50 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6">
                <div class="flex min-w-0 flex-1 flex-col gap-2">
                  <h3 class="wrap-anywhere text-base font-medium">{task.subject.title}</h3>
                  <p class="text-xs text-muted-foreground">
                    {#if task.status === 'completed'}
                      {task.result.decision === 'approved' ? 'Approval recorded' : 'Rejection recorded'} ·
                      <time datetime={task.completedAt}>{formatUtcDateTime(task.completedAt)} UTC</time>
                    {:else}
                      Requested <time datetime={task.createdAt}>{formatUtcDateTime(task.createdAt)} UTC</time>
                    {/if}
                  </p>
                </div>
                <ArrowRightIcon class="size-4 shrink-0 text-muted-foreground" weight="regular" aria-hidden="true" />
              </a>
            </li>
          {:else}
            <li class="px-5 py-8 text-sm text-muted-foreground sm:px-6">
              {group.empty}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>
