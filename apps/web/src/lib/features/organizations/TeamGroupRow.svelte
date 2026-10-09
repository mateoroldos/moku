<script lang="ts">
  import * as Table from '@moku/ui/ui/table';

  let { label, count }: { label: string; count: number } = $props();
</script>

<Table.Row>
  <Table.Cell colspan={3}>
    <span class="text-xs text-muted-foreground">{label} <span class="ml-1 tabular-nums">{count}</span></span>
  </Table.Cell>
</Table.Row>
