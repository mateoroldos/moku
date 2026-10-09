<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import * as AlertDialog from '@moku/ui/ui/alert-dialog';
  import * as Field from '@moku/ui/ui/field';
  import type { Snippet } from 'svelte';
  import type { CommandFailure } from './command-failure.ts';

  let { open = $bindable(false), title, description, cancel, action, pendingAction, onconfirm, oncancel }: {
    open?: boolean;
    title: string;
    description: Snippet;
    cancel: string;
    action: string;
    pendingAction: string;
    /** Resolves to the failure to show in the dialog, or nothing once done. */
    onconfirm: () => Promise<CommandFailure | undefined>;
    oncancel?: () => void;
  } = $props();

  let pending = $state(false);
  let failure = $state<CommandFailure>();

  const confirm = async () => {
    pending = true;
    failure = await onconfirm();
    pending = false;

    if (!failure) open = false;
  };
</script>

<AlertDialog.Root bind:open onOpenChange={(next) => {
  if (next) return;
  // Refreshing earlier could remove this dialog with its row.
  if (failure?.refused) void refreshAll();
  failure = undefined;
  oncancel?.();
}}>
  <AlertDialog.Content escapeKeydownBehavior={pending ? 'ignore' : 'close'}>
    <AlertDialog.Header>
      <AlertDialog.Title class="wrap-anywhere">{title}</AlertDialog.Title>
      <AlertDialog.Description>{@render description()}</AlertDialog.Description>
    </AlertDialog.Header>
    {#if failure}<Field.Error role="alert">{failure.message}</Field.Error>{/if}
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={pending}>{cancel}</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive" disabled={pending} onclick={confirm}>{pending ? pendingAction : action}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
