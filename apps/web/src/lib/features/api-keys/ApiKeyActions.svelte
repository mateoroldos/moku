<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import { toast } from 'svelte-sonner';
  import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
  import * as AlertDialog from '@moku/ui/ui/alert-dialog';
  import { Button } from '@moku/ui/ui/button';
  import * as DropdownMenu from '@moku/ui/ui/dropdown-menu';
  import * as Field from '@moku/ui/ui/field';
  import { revokeApiKey } from './api-keys.remote.ts';

  let { apiKey }: { apiKey: { id: string; name: string } } = $props();

  const revocation = $derived(revokeApiKey.for(apiKey.id));
  let revoking = $state(false);
  let unconfirmed = $state<string>();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="icon" class="pointer-coarse:size-11" aria-label={`Actions for ${apiKey.name}`}>
        <DotsThreeIcon weight="regular" aria-hidden="true" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-auto">
    <DropdownMenu.Group>
      <DropdownMenu.Item variant="destructive" onSelect={() => (revoking = true)}>Revoke key</DropdownMenu.Item>
    </DropdownMenu.Group>
  </DropdownMenu.Content>
</DropdownMenu.Root>

<AlertDialog.Root bind:open={revoking} onOpenChange={(open) => {
  if (!open) unconfirmed = undefined;
}}>
  <AlertDialog.Content escapeKeydownBehavior={revocation.pending > 0 ? 'ignore' : 'close'}>
    <form class="grid gap-4" {...revocation.enhance(async (submission) => {
      unconfirmed = undefined;

      try {
        // A redirect, such as to login, also settles the submission without a result.
        if (await submission.submit() && revocation.result) toast.success(`${apiKey.name} revoked.`);
      } catch (error) {
        // Page failures belong to the route boundary.
        if (isHttpError(error) && error.status < 500) throw error;
        if (!isHttpError(error)) console.error('API key revocation request failed');
        unconfirmed = isHttpError(error) ? error.body.message : 'We couldn’t reach Moku. Check your connection and try again.';
      }
    })}>
      <AlertDialog.Header>
        <AlertDialog.Title class="wrap-anywhere">Revoke {apiKey.name}?</AlertDialog.Title>
        <AlertDialog.Description>Agents using it lose access right away. This can’t be undone.</AlertDialog.Description>
      </AlertDialog.Header>
      {#if unconfirmed}<Field.Error role="alert">{unconfirmed}</Field.Error>{/if}
      <AlertDialog.Footer>
        <AlertDialog.Cancel type="button" disabled={revocation.pending > 0}>Keep key</AlertDialog.Cancel>
        <AlertDialog.Action type="submit" variant="destructive" disabled={revocation.pending > 0}>
          {revocation.pending > 0 ? 'Revoking…' : 'Revoke key'}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </form>
  </AlertDialog.Content>
</AlertDialog.Root>
