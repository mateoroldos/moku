<script lang="ts">
  import TrayIcon from 'phosphor-svelte/lib/TrayIcon';
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

  <section aria-labelledby="inbox-heading" class="overflow-hidden rounded-xl border bg-card">
    <div class="border-b px-5 py-4 sm:px-6">
      <h2 id="inbox-heading" class="text-sm font-medium">Inbox</h2>
    </div>
    <div class="flex flex-col items-center gap-4 px-6 py-20 text-center sm:py-28">
      <div class="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <TrayIcon class="size-5" weight="regular" aria-hidden="true" />
      </div>
      <div class="flex max-w-sm flex-col gap-2">
        <h3 class="text-base font-medium">Your inbox starts here</h3>
        <p class="text-sm leading-relaxed text-muted-foreground">
          This is a preview of Moku’s interface. Workspaces and agent connections aren’t available yet.
        </p>
      </div>
    </div>
  </section>
</div>
