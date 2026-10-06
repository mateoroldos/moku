<script lang="ts">
	import { PinInput as InputOTPPrimitive } from "bits-ui";
	import { cn } from "@moku/ui/cn.js";

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(""),
		...restProps
	}: InputOTPPrimitive.RootProps = $props();
</script>

<!-- eslint-disable shadcn/no-unknown-classes -- Upstream cn-input-otp is a styling hook, not a Tailwind utility. -->
<InputOTPPrimitive.Root
	bind:ref
	bind:value
	data-slot="input-otp"
	spellcheck={false}
	class={cn(
		"cn-input-otp flex items-center has-disabled:opacity-50",
		"disabled:cursor-not-allowed",
		className
	)}
	{...restProps}
/>
