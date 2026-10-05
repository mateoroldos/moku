<script lang="ts">
  import * as Sidebar from '@moku/ui/ui/sidebar';
  import OrganizationSidebar from '#lib/features/organizations/OrganizationSidebar.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
</script>

<Sidebar.Provider>
  <OrganizationSidebar organizations={data.organizations} userId={data.viewer.userId} />
  <div class="flex min-w-0 flex-1 flex-col">
    <header class="flex h-16 items-center gap-3 border-b px-5 sm:px-8">
      <Sidebar.Trigger />
      <a href="/" class="rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" aria-label="Moku home">Moku</a>
    </header>
    <main id="main" tabindex="-1" class="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-16">
      {@render children()}
    </main>
  </div>
</Sidebar.Provider>
