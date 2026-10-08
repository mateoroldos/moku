<script lang="ts">
  import type { HTMLSelectAttributes } from 'svelte/elements';

  let props: HTMLSelectAttributes = $props();
</script>

<select {...props}
  class="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:bg-input/50 min-h-11 w-full rounded-lg border bg-transparent px-2.5 text-base outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm">
  <option value="member">Member</option>
  <option value="viewer">Viewer</option>
  <option value="admin">Admin</option>
  <option value="owner">Owner</option>
</select>
