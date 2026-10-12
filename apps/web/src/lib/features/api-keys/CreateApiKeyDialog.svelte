<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import { toast } from 'svelte-sonner';
  import type { OrganizationId } from '@moku/domain/organization';
  import { Button } from '@moku/ui/ui/button';
  import * as Dialog from '@moku/ui/ui/dialog';
  import * as Field from '@moku/ui/ui/field';
  import { Input } from '@moku/ui/ui/input';
  import { createApiKey } from './api-keys.remote.ts';

  let { organizationId }: { organizationId: OrganizationId } = $props();

  let open = $state(false);
  let created = $state<{ name: string; secret: string }>();
  let unconfirmed = $state(false);

  const copy = (secret: string) =>
    navigator.clipboard.writeText(secret).then(
      () => toast.success('Key copied.'),
      () => toast.error('We couldn’t copy the key. Select it and copy it yourself.'),
    );
</script>

<Dialog.Root bind:open onOpenChange={(next) => {
  if (next) return;
  // The secret is shown once; closing the dialog forgets it.
  created = undefined;
  unconfirmed = false;
}}>
  <Dialog.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline" class="pointer-coarse:min-h-11">Create key</Button>
    {/snippet}
  </Dialog.Trigger>
  <Dialog.Content interactOutsideBehavior={created ? 'ignore' : 'close'}>
    {#if created}
      <Dialog.Header>
        <Dialog.Title class="wrap-anywhere">Copy the key for {created.name}</Dialog.Title>
        <Dialog.Description>You won’t see it again. If you lose it, revoke it and create another.</Dialog.Description>
      </Dialog.Header>
      <code aria-label="API key" class="block rounded-md border px-3 py-2 font-mono text-sm break-all select-all">{created.secret}</code>
      <Dialog.Footer class="mt-6">
        <Dialog.Close>
          {#snippet child({ props })}
            <Button {...props} variant="outline" class="pointer-coarse:min-h-11">Done</Button>
          {/snippet}
        </Dialog.Close>
        <Button class="pointer-coarse:min-h-11" onclick={() => created && copy(created.secret)}>Copy key</Button>
      </Dialog.Footer>
    {:else}
      <Dialog.Header>
        <Dialog.Title>Create an API key</Dialog.Title>
        <Dialog.Description>Name it after the agent that uses it.</Dialog.Description>
      </Dialog.Header>
      <form aria-busy={createApiKey.pending > 0} {...createApiKey.enhance(async (submission) => {
        unconfirmed = false;

        try {
          if (!(await submission.submit())) return;

          created = createApiKey.result;
          createApiKey.fields.name.set('');
        } catch (error) {
          // Page failures belong to the route boundary; an unconfirmed outcome stays in the dialog.
          if (isHttpError(error) && error.status < 500) throw error;
          if (!isHttpError(error)) console.error('API key creation request failed');
          unconfirmed = true;
        }
      })}>
        <input {...createApiKey.fields.organizationId.as('hidden', organizationId)} />
        <Field.Group>
          <Field.Field data-invalid={!!createApiKey.fields.name.issues()?.length}>
            <Field.Label for="api-key-name">Name</Field.Label>
            <Input {...createApiKey.fields.name.as('text')} id="api-key-name" autocomplete="off" required maxlength={32}
              aria-invalid={!!createApiKey.fields.name.issues()?.length} aria-describedby="api-key-name-errors"
              disabled={createApiKey.pending > 0} class="pointer-coarse:min-h-11" />
            <Field.Error id="api-key-name-errors" errors={createApiKey.fields.name.issues() ?? []} />
          </Field.Field>
          <Field.Error errors={createApiKey.fields.issues() ?? []} />
          {#if unconfirmed}
            <Field.Error role="alert">We couldn’t confirm the key was created. Check the list before trying again.</Field.Error>
          {/if}
        </Field.Group>
        <Dialog.Footer class="mt-6">
          <Button type="submit" class="pointer-coarse:min-h-11" disabled={createApiKey.pending > 0}>
            {createApiKey.pending > 0 ? 'Creating…' : 'Create key'}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
