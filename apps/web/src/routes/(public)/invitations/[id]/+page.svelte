<script lang="ts">
  import { goto } from '$app/navigation';
  import { isHttpError } from '@sveltejs/kit';
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
  let signOutFailed = $state(false);

  const switchAccount = async (userId: UserId) => {
    if (signingOut) return;
    signingOut = true;
    signOutFailed = false;

    try {
      const { error } = await authClient.signOut();
      if (error) {
        console.error('Sign-out request rejected', { status: error.status, code: error.code });
        signOutFailed = true;
        return;
      }
      FeedbackDrafts.browser.clearUser(userId);

      await goto(withInvitation('/login', params.id), { refreshAll: true });
    } catch {
      console.error('Sign-out request failed');
      signOutFailed = true;
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
      acceptFailed = false;

      try {
        await submission.submit();
      } catch (failure) {
        if (!isHttpError(failure)) console.error('Invitation acceptance request failed');
        acceptFailed = true;
        // An invitation that became unavailable switches to its own view.
        if (isHttpError(failure, 404)) await getInvitation(params.id).refresh().catch(() => console.error('Invitation refresh failed'));
      }
    })}>
      <Field.Group>
        <input {...acceptInvitation.fields.id.as('hidden', params.id)} />
        {#if acceptFailed}<Field.Error role="alert">We couldn’t accept this invitation. Try again.</Field.Error>{/if}
        <Button type="submit" disabled={acceptInvitation.pending > 0}>{acceptInvitation.pending > 0 ? 'Joining…' : 'Join organization'}</Button>
      </Field.Group>
    </form>
  {:else if view._tag === 'SignedOut'}
    <h1 id="invitation-heading" class="font-serif text-4xl tracking-tight">You’re invited to Moku</h1>
    <p class="mt-3 text-sm text-muted-foreground">Sign in or create an account with the email this invitation was sent to.</p>
    <div class="mt-8 flex flex-col gap-3">
      <Button href={withInvitation('/login', params.id)}>Sign in</Button>
      <Button href={withInvitation('/signup', params.id)} variant="outline">Create account</Button>
    </div>
  {:else}
    <h1 id="invitation-heading" class="font-serif text-4xl tracking-tight">This invitation isn’t available</h1>
    <p class="mt-3 text-sm text-muted-foreground">It expired, was cancelled or accepted, or was sent to another email. Sign in with the invited email, or ask for a new invitation.</p>
    {#if signOutFailed}<p role="alert" class="mt-3 text-sm text-destructive">We couldn’t sign you out. Try again.</p>{/if}
    <div class="mt-8 flex flex-col gap-3">
      <Button href="/">Open Moku</Button>
      <Button variant="outline" disabled={signingOut} onclick={() => switchAccount(view.userId)}>{signingOut ? 'Signing out…' : 'Sign in with another account'}</Button>
    </div>
  {/if}
</section>
