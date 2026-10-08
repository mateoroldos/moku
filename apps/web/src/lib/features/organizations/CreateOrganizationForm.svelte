<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';
  import { createOrganization } from './organizations.remote.ts';

  let submissionFailed = $state(false);
</script>

<form class="mt-8" aria-busy={createOrganization.pending > 0} {...createOrganization.enhance(async (submission) => {
  submissionFailed = false;

  try {
    if (await submission.submit()) createOrganization.fields.set({ name: '' });
  } catch (failure) {
    if (isHttpError(failure) && failure.status < 500) throw failure;
    if (!isHttpError(failure)) console.error('Organization creation request failed');
    submissionFailed = true;
  }
})}>
  <Field.Group>
    <Field.Field data-invalid={!!createOrganization.fields.name.issues()?.length}>
      <Field.Label for="organization-name">Organization name</Field.Label>
      <Input {...createOrganization.fields.name.as('text')} id="organization-name" autocomplete="organization" required
        aria-invalid={!!createOrganization.fields.name.issues()?.length} aria-describedby="name-errors"
        disabled={createOrganization.pending > 0} class="min-h-11" />
      <Field.Error id="name-errors" errors={createOrganization.fields.name.issues() ?? []} />
    </Field.Field>
    {#if submissionFailed}
      <Field.Field>
        <Field.Error role="alert">We couldn’t confirm creation. Check your organizations before trying again.</Field.Error>
        <a href="/" data-sveltekit-reload class="text-sm text-primary underline underline-offset-4">Check organizations</a>
      </Field.Field>
    {/if}
    <Field.Field orientation="horizontal">
      <Button type="submit" disabled={createOrganization.pending > 0}>{createOrganization.pending > 0 ? 'Creating…' : 'Create organization'}</Button>
      <Button href="/" variant="outline">Cancel</Button>
    </Field.Field>
  </Field.Group>
</form>
