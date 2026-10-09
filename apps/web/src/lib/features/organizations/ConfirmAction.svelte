<script lang="ts">
  import * as AlertDialog from '@moku/ui/ui/alert-dialog';
  import * as Field from '@moku/ui/ui/field';
  import type { Snippet } from 'svelte';

  let { open = $bindable(false), title, description, cancel, action, pendingAction, form, pending, failure, onclose }: {
    open?: boolean;
    title: string;
    description: Snippet;
    cancel: string;
    action: string;
    pendingAction: string;
    /** The id of the form the action submits; the dialog renders outside it. */
    form: string;
    pending: boolean;
    failure: string | undefined;
    onclose?: () => void;
  } = $props();
</script>

<AlertDialog.Root bind:open onOpenChange={(next) => { if (!next) onclose?.(); }}>
  <AlertDialog.Content escapeKeydownBehavior={pending ? 'ignore' : 'close'}>
    <AlertDialog.Header>
      <AlertDialog.Title class="wrap-anywhere">{title}</AlertDialog.Title>
      <AlertDialog.Description>{@render description()}</AlertDialog.Description>
    </AlertDialog.Header>
    {#if failure}<Field.Error role="alert">{failure}</Field.Error>{/if}
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={pending}>{cancel}</AlertDialog.Cancel>
      <AlertDialog.Action type="submit" {form} variant="destructive" disabled={pending}>{pending ? pendingAction : action}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
