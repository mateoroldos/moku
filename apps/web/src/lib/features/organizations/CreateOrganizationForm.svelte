<script lang="ts">
  import { goto } from '$app/navigation';
  import { isHttpError } from '@sveltejs/kit';
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import { createOrganization } from './organizations.remote.ts';

  const creation = createOrganization;
  let message = $state<string | null>(null);
</script>

{#if creation.result}
  <div class="mt-8 flex flex-col items-start gap-4">
    <p role="status">{creation.result.name} was created.</p>
    {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
    <Button href={`/org/${encodeURIComponent(creation.result.id)}`} data-sveltekit-reload>Open organization</Button>
  </div>
{:else}
  <form class="mt-8" aria-busy={creation.pending > 0} {...creation.enhance(async (submission) => {
    message = null;

    try {
      await submission.submit().updates();
    } catch (failure) {
      if (isHttpError(failure, 403)) throw failure;
      if (!isHttpError(failure)) console.error('Organization creation request failed');
      message = 'We couldn’t confirm creation. Check your organizations before trying again.';
      return;
    }

    if (!submission.result) return;

    try {
      await goto(`/org/${encodeURIComponent(submission.result.id)}`, {
        refreshAll: true,
        state: { createdOrganization: submission.result },
      });
    } catch {
      console.error('Opening the created organization failed');
      message = 'Your organization was created, but we couldn’t open its inbox. Open it using the link below.';
    }
  })}>
    <Field.Group>
      <Field.Field data-invalid={!!creation.fields.name.issues()?.length}>
        <Field.Label for="organization-name">Organization name</Field.Label>
        <Input {...creation.fields.name.as('text')} id="organization-name" autocomplete="organization" required
          aria-invalid={!!creation.fields.name.issues()?.length} aria-describedby="name-errors"
          disabled={creation.pending > 0} class="min-h-11" />
        <Field.Error id="name-errors" errors={creation.fields.name.issues() ?? []} />
      </Field.Field>
      {#if message}
        <Field.Field>
          <Field.Error role="alert">{message}</Field.Error>
          <a href="/" data-sveltekit-reload class="text-sm text-primary underline underline-offset-4">Check organizations</a>
        </Field.Field>
      {/if}
      <Field.Field orientation="horizontal">
        <Button type="submit" disabled={creation.pending > 0}>{creation.pending > 0 ? 'Creating…' : 'Create organization'}</Button>
        <Button href="/" variant="outline">Cancel</Button>
      </Field.Field>
    </Field.Group>
  </form>
{/if}
