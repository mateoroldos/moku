<script lang="ts">
	import { mode } from "mode-watcher";
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";
	import Loader2Icon from 'phosphor-svelte/lib/CircleNotchIcon';
	import CircleCheckIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import OctagonXIcon from 'phosphor-svelte/lib/XCircleIcon';
	import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
	import TriangleAlertIcon from 'phosphor-svelte/lib/WarningIcon';

	let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
	theme={mode.current ?? "system"}
	style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" aria-hidden="true" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" aria-hidden="true" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" aria-hidden="true" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" aria-hidden="true" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4" aria-hidden="true" />
	{/snippet}
</Sonner>
