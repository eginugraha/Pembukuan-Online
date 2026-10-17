<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import type { NextStep } from '$lib/server/dashboard/next-step';

	let { step, onnavigate }: { step: NextStep; onnavigate?: () => void } = $props();
</script>

<div class="relative mt-8 rounded-[20px] bg-[image:var(--hero-next)] px-4 pt-8 pb-4 text-center">
	<span class="icon-tile absolute -top-5 left-1/2 size-10 -translate-x-1/2 rounded-full bg-card! text-deep ring-4 ring-[var(--next-ring)]">
		<Sparkles class="size-5" />
	</span>
	<p class="text-xs font-semibold tracking-wide text-deep/70 uppercase">Langkah berikutnya</p>
	<p class="mt-1 text-sm font-bold text-ink">{step.label}</p>
	<p class="mt-1 text-xs text-ink/65">{step.detail}</p>
	<a
		href={step.href}
		onclick={onnavigate}
		class="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-card py-2 text-xs font-semibold text-deep shadow-[0_8px_16px_-10px_rgb(0_0_0/0.35)] transition hover:shadow-[0_10px_20px_-10px_rgb(0_0_0/0.45)]"
	>
		Mulai <ArrowRight class="size-3.5" />
	</a>
</div>
