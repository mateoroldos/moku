<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import * as Sidebar from '@moku/ui/ui/sidebar';
  import * as DropdownMenu from '@moku/ui/ui/dropdown-menu';
  import type { Organization } from '@moku/domain/organization';
  import type { UserId } from '@moku/domain/identity';
  import type { Schema } from 'effect';
  import { toggleMode } from 'mode-watcher';
  import { toast } from 'svelte-sonner';
  import BuildingsIcon from 'phosphor-svelte/lib/BuildingsIcon';
  import CaretUpDownIcon from 'phosphor-svelte/lib/CaretUpDownIcon';
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import TrayIcon from 'phosphor-svelte/lib/TrayIcon';
  import CircleHalfIcon from 'phosphor-svelte/lib/CircleHalfIcon';
  import SignOutIcon from 'phosphor-svelte/lib/SignOutIcon';
  import { authClient } from '#lib/features/auth/client.ts';
  import { FeedbackDrafts } from '#lib/features/human-tasks/feedback-drafts.ts';

  let { organizations, userId }: {
    organizations: ReadonlyArray<Schema.Codec.Encoded<typeof Organization>>;
    userId: Schema.Codec.Encoded<typeof UserId>;
  } = $props();

  const sidebar = Sidebar.useSidebar();
  const current = $derived(organizations.find((organization) => organization.id === page.params.organizationId));
  const label = $derived(current?.name ?? (organizations.length > 0 ? 'Choose organization' : 'No organization access'));
  const inbox = $derived(current ? `/org/${encodeURIComponent(current.id)}` : undefined);
  const inboxActive = $derived(inbox !== undefined && (page.url.pathname === inbox || page.url.pathname.startsWith(`${inbox}/tasks/`)));
  let signingOut = $state(false);
  let switcherOpen = $state(false);

  afterNavigate(() => {
    switcherOpen = false;
    sidebar.setOpenMobile(false);
  });

  const signOut = async () => {
    if (signingOut) return;
    const signedOutUser = userId;
    signingOut = true;
    toast.dismiss('sign-out');

    try {
      const { error } = await authClient.signOut();
      if (error) {
        console.error('Sign-out request rejected', { status: error.status, code: error.code });
        sidebar.setOpenMobile(false);
        toast.error(
          error.code === 'INVALID_ORIGIN' || error.code === 'MISSING_OR_NULL_ORIGIN'
            ? 'Sign-out was blocked by this site’s security settings. Contact your administrator.'
            : 'We couldn’t sign you out. Try again.',
          { id: 'sign-out' },
        );
        return;
      }
      FeedbackDrafts.browser.clearUser(signedOutUser);

      await goto('/login', { refreshAll: true });

      // The old form can still write while navigation is pending.
      FeedbackDrafts.browser.clearUser(signedOutUser);
    } catch {
      console.error('Sign-out request failed');
      sidebar.setOpenMobile(false);
      toast.error('We couldn’t sign you out. Check your connection and try again.', { id: 'sign-out' });
    } finally {
      signingOut = false;
    }
  };
</script>

<Sidebar.Root collapsible="icon">
  <Sidebar.Header>
    {#if organizations.length > 0}
      <nav aria-label="Organizations">
        <Sidebar.Menu>
          <Sidebar.MenuItem>
          <DropdownMenu.Root bind:open={switcherOpen}>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Sidebar.MenuButton {...props} size="lg" aria-label="Switch organization" tooltipContent="Switch organization">
                  <BuildingsIcon aria-hidden="true" />
                  <span class="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:sr-only">
                    <span class="truncate">{label}</span>
                    <span class="text-xs text-muted-foreground">Switch organization</span>
                  </span>
                  <CaretUpDownIcon class="ml-auto group-data-[collapsible=icon]:hidden" aria-hidden="true" />
                </Sidebar.MenuButton>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content portalProps={{ disabled: true }} side={sidebar.isMobile ? 'bottom' : 'right'} align="start" class="min-w-56" aria-label="Switch organization">
              <DropdownMenu.Group>
                <DropdownMenu.GroupHeading>Organizations</DropdownMenu.GroupHeading>
                {#each organizations as organization (organization.id)}
                  <!-- Closing on select unmounts the link before Kit receives keyboard-triggered clicks; afterNavigate closes it. -->
                  <DropdownMenu.Item closeOnSelect={false}>
                    {#snippet child({ props })}
                      <a {...props} href={`/org/${encodeURIComponent(organization.id)}`} aria-current={current?.id === organization.id ? 'true' : undefined}>
                        <span>{organization.name}</span>
                        {#if current?.id === organization.id}<CheckIcon class="ml-auto" aria-hidden="true" />{/if}
                      </a>
                    {/snippet}
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Group>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </nav>
    {:else}
      <div class="flex h-12 items-center gap-2 overflow-hidden px-2 text-sm" title={label}>
        <BuildingsIcon class="size-4 shrink-0" aria-hidden="true" />
        <span class="truncate group-data-[collapsible=icon]:sr-only">{label}</span>
      </div>
    {/if}
  </Sidebar.Header>
  <Sidebar.Content>
    <Sidebar.Group>
      {#if inbox}
        <nav aria-label="Main navigation">
          <Sidebar.Menu>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={inboxActive} tooltipContent="Inbox">
                {#snippet child({ props })}
                  <a {...props} href={inbox} aria-current={page.url.pathname === inbox ? 'page' : undefined}>
                    <TrayIcon aria-hidden="true" /><span class="group-data-[collapsible=icon]:sr-only">Inbox</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        </nav>
      {/if}
    </Sidebar.Group>
  </Sidebar.Content>
  <Sidebar.Footer>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton onclick={toggleMode} tooltipContent="Toggle color theme" aria-label="Toggle color theme">
          <CircleHalfIcon aria-hidden="true" /><span class="group-data-[collapsible=icon]:sr-only">Toggle color theme</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton disabled={signingOut} onclick={signOut} tooltipContent="Sign out" aria-label="Sign out">
          <SignOutIcon aria-hidden="true" /><span class="group-data-[collapsible=icon]:sr-only">{signingOut ? 'Signing out…' : 'Sign out'}</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>
</Sidebar.Root>
