<script lang="ts">
	import SidebarIcon from 'phosphor-svelte/lib/Sidebar';
	import { Button } from "@moku/ui/ui/button/index.js";
	import { cn } from "@moku/ui/cn.js";
	import { useSidebar } from "./context.svelte.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		onclick,
		...restProps
	}: ComponentProps<typeof Button> & {
		onclick?: (e: MouseEvent) => void;
	} = $props();

	const sidebar = useSidebar();
</script>

<!-- eslint-disable shadcn/no-unknown-classes -- Preserve the upstream optional cn-rtl-flip utility. -->
<Button
	bind:ref
	data-sidebar="trigger"
	data-slot="sidebar-trigger"
	variant="ghost"
	size="icon-sm"
	class={cn(className)}
	type="button"
	onclick={(e) => {
		onclick?.(e);
		sidebar.toggle();
	}}
	{...restProps}
>
	<SidebarIcon class="cn-rtl-flip" />
	<span class="sr-only">Toggle Sidebar</span>
</Button>
