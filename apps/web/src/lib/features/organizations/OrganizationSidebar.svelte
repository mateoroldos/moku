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
  import UsersIcon from 'phosphor-svelte/lib/UsersIcon';
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
  const team = $derived(inbox ? `${inbox}/team` : undefined);
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
      <nav aria-label="Organizations">
        <Sidebar.Menu>
          <Sidebar.MenuItem>
          <DropdownMenu.Root bind:open={switcherOpen}>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                  <Sidebar.MenuButton {...props} size="lg" aria-label="Organizations" tooltipContent="Organizations">
                  <BuildingsIcon aria-hidden="true" />
                  <span class="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:sr-only">
                    <span class="truncate">{label}</span>
                    <span class="text-xs text-muted-foreground">Organizations</span>
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
              <DropdownMenu.Separator />
              <DropdownMenu.Group>
                <DropdownMenu.Item closeOnSelect={false}>
                  {#snippet child({ props })}
                    <a {...props} href="/organizations/new">Create organization</a>
                  {/snippet}
                </DropdownMenu.Item>
              </DropdownMenu.Group>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </nav>
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
            {#if team}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton isActive={page.url.pathname === team} tooltipContent="Team">
                  {#snippet child({ props })}
                    <a {...props} href={team} aria-current={page.url.pathname === team ? 'page' : undefined}>
                      <UsersIcon weight="regular" aria-hidden="true" /><span class="group-data-[collapsible=icon]:sr-only">Team</span>
                    </a>
                  {/snippet}
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            {/if}
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
        <Sidebar.MenuButton tooltipContent="Sign out" aria-label="Sign out">
          {#snippet child({ props })}
            <button {...props} disabled={signingOut} onclick={signOut}>
              <SignOutIcon aria-hidden="true" /><span class="group-data-[collapsible=icon]:sr-only">{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>
</Sidebar.Root>
