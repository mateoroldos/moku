<script lang="ts">
  import { Button } from '@moku/ui/ui/button';
  import { Input } from '@moku/ui/ui/input';
  import * as Field from '@moku/ui/ui/field';

  let { value = $bindable(''), disabled = false }: { value?: string; disabled?: boolean } = $props();
  let visible = $state(false);
</script>

<Field.Field>
  <div class="flex items-center justify-between">
    <Field.Label for="password">New password</Field.Label>
    <Button variant="link" aria-label={visible ? 'Hide password' : 'Show password'} aria-controls="password" aria-pressed={visible} onclick={() => { visible = !visible; }} {disabled}>{visible ? 'Hide' : 'Show'}</Button>
  </div>
  <Input id="password" name="password" type={visible ? 'text' : 'password'} autocomplete="new-password" minlength={8} maxlength={128} required bind:value {disabled} aria-describedby="password-help" />
  <Field.Description id="password-help">At least 8 characters.</Field.Description>
</Field.Field>
