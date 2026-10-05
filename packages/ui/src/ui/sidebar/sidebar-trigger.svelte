<script lang="ts">
	import PanelLeftIcon from 'phosphor-svelte/lib/SidebarSimpleIcon';
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
	<PanelLeftIcon aria-hidden="true" />
	<span class="sr-only">Toggle sidebar</span>
</Button>
