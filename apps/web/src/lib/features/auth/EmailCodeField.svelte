<script lang="ts">
  import * as Field from '@moku/ui/ui/field';
  import * as InputOTP from '@moku/ui/ui/input-otp';

  let { value = $bindable(''), disabled = false, error = null }: { value?: string; disabled?: boolean; error?: string | null } = $props();
</script>

<Field.Field data-invalid={!!error}>
  <Field.Label for="email-code">Email code</Field.Label>
  <InputOTP.Root inputId="email-code" name="otp" maxlength={6} minlength={6} pattern="^[0-9]*$" autocomplete="one-time-code" inputmode="numeric" required bind:value {disabled} aria-invalid={!!error} aria-describedby={error ? 'email-code-error' : undefined}>
    {#snippet children({ cells })}
      <InputOTP.Group>{#each cells as cell (cell)}<InputOTP.Slot {cell} aria-invalid={!!error} />{/each}</InputOTP.Group>
    {/snippet}
  </InputOTP.Root>
  {#if error}<Field.Error id="email-code-error" role="alert">{error}</Field.Error>{/if}
</Field.Field>
