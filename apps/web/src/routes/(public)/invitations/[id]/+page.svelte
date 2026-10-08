<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { isHttpError } from '@sveltejs/kit';
  import { toast } from 'svelte-sonner';
  import type { UserId } from '@moku/domain/identity';
  import { Button } from '@moku/ui/ui/button';
  import * as Field from '@moku/ui/ui/field';
  import { authClient } from '#lib/features/auth/client.ts';
  import { FeedbackDrafts } from '#lib/features/human-tasks/feedback-drafts.ts';
  import { acceptInvitation, getInvitation } from '#lib/features/invitations/invitations.remote.ts';
  import { withInvitation } from '#lib/features/invitations/invitation-return.ts';
  import type { PageProps } from './$types';

  let { params }: PageProps = $props();

  const view = $derived(await getInvitation(params.id));
  let acceptFailed = $state(false);
  let signingOut = $state(false);

  const switchAccount = async (userId: UserId) => {
    if (signingOut) return;
    signingOut = true;
    toast.dismiss('sign-out');

    try {
      const { error } = await authClient.signOut();
      if (error) {
        console.error('Sign-out request rejected', { status: error.status, code: error.code });
        toast.error(
          error.code === 'INVALID_ORIGIN' || error.code === 'MISSING_OR_NULL_ORIGIN'
            ? 'Sign-out was blocked by this site’s security settings. Contact your administrator.'
            : 'We couldn’t sign you out. Try again.',
          { id: 'sign-out' },
        );
        return;
      }
      FeedbackDrafts.browser.clearUser(userId);

      await goto(withInvitation('/login', params.id), { refreshAll: true });
    } catch {
      console.error('Sign-out request failed');
      toast.error('We couldn’t sign you out. Check your connection and try again.', { id: 'sign-out' });
    } finally {
      signingOut = false;
    }
  };
</script>

<svelte:head><title>Invitation · Moku</title></svelte:head>

<section class="mx-auto max-w-sm py-12 sm:py-20" aria-labelledby="invitation-heading">
  {#if view._tag === 'Pending'}
    <h1 id="invitation-heading" class="font-serif text-4xl tracking-tight wrap-anywhere">Join {view.invitation.organizationName}</h1>
    <p class="mt-3 text-sm text-muted-foreground">
      <span class="break-all text-foreground">{view.invitation.inviterEmail}</span> invited you to join as <span class="text-foreground">{view.invitation.role}</span>.
      Sent to <span class="break-all text-foreground">{view.invitation.email}</span>.
    </p>
    <form class="mt-8" aria-busy={acceptInvitation.pending > 0} {...acceptInvitation.enhance(async (submission) => {
      const { organizationName } = view.invitation;
      acceptFailed = false;

      try {
        // An unavailable invitation stays on this page and renders its own state.
        if (await submission.submit() && page.url.pathname.startsWith('/org/')) toast.success(`You joined ${organizationName}.`);
      } catch (failure) {
        if (isHttpError(failure) && failure.status < 500) throw failure;
        if (!isHttpError(failure)) console.error('Invitation acceptance request failed');
        acceptFailed = true;
      }
    })}>
      <Field.Group>
        <input {...acceptInvitation.fields.id.as('hidden', params.id)} />
        {#if acceptFailed}<Field.Error role="alert">We couldn’t confirm that you joined. Try again.</Field.Error>{/if}
        <Button type="submit" disabled={acceptInvitation.pending > 0}>{acceptInvitation.pending > 0 ? 'Joining…' : 'Join organization'}</Button>
      </Field.Group>
    </form>
  {:else}
    <h1 id="invitation-heading" class="font-serif text-4xl tracking-tight">This invitation isn’t available</h1>
    <p class="mt-3 text-sm text-muted-foreground">It expired, was cancelled or accepted, or was sent to another email. Sign in with the invited email, or ask for a new invitation.</p>
    <div class="mt-8 flex flex-col gap-3">
      <Button href="/">Open Moku</Button>
      <Button variant="outline" disabled={signingOut} onclick={() => switchAccount(view.userId)}>{signingOut ? 'Signing out…' : 'Sign in with another account'}</Button>
    </div>
  {/if}
</section>
