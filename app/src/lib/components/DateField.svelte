<script lang="ts">
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date';
	import { DatePicker } from 'bits-ui';
	import { cn } from '$lib/utils';

	let {
		value = $bindable(''),
		id,
		name,
		class: className,
		'aria-label': ariaLabel,
		'aria-invalid': ariaInvalid,
		'aria-describedby': ariaDescribedby,
		onblur,
		onchange
	}: {
		/** Tanggal ISO `YYYY-MM-DD`; string kosong = belum diisi. */
		value?: string;
		id?: string;
		/** Bila diisi, nilai ikut terkirim pada submit form biasa (input hidden). */
		name?: string;
		class?: string;
		'aria-label'?: string;
		'aria-invalid'?: 'true' | undefined;
		'aria-describedby'?: string;
		onblur?: (e: FocusEvent) => void;
		onchange?: (value: string) => void;
	} = $props();

	let open = $state(false);
	let groupEl = $state<HTMLElement | null>(null);
	// Tanggal belum lengkap: ada segmen terisi tetapi nilai belum terbentuk (mis. hari & bulan tanpa tahun).
	let partial = $state(false);
	const partialId = $derived(`${id ?? 'datefield'}-partial`);

	// Segmen kosong ditandai bits-ui lewat aria-valuetext="Empty" (bukan atribut data-placeholder).
	const filledSegments = () => [...(groupEl?.querySelectorAll('[role="spinbutton"]') ?? [])].filter((s) => s.getAttribute('aria-valuetext') !== 'Empty').length;
	function recheck() {
		queueMicrotask(() => (partial = !value && filledSegments() > 0));
	}
	$effect(() => {
		if (value) partial = false;
	});
	// Form filter (GET) tidak boleh terkirim dengan tanggal setengah jadi: tahan submit dan fokuskan field.
	$effect(() => {
		const form = groupEl?.closest('form');
		if (!form) return;
		const onsubmit = (e: SubmitEvent) => {
			if (!value && filledSegments() > 0) {
				e.preventDefault();
				partial = true;
				groupEl?.querySelector<HTMLElement>('[role="spinbutton"]')?.focus();
			}
		};
		form.addEventListener('submit', onsubmit);
		return () => form.removeEventListener('submit', onsubmit);
	});
	// "onblur" untuk validasi: fokus benar-benar meninggalkan field (bukan sedang memilih di kalender).
	function onfocusout() {
		recheck();
		setTimeout(() => {
			if (!open && !groupEl?.contains(document.activeElement)) onblur?.(new FocusEvent('blur'));
		}, 0);
	}
	const dateValue = $derived.by(() => {
		try {
			return value ? parseDate(value) : undefined;
		} catch {
			return undefined;
		}
	});

	function set(d: DateValue | undefined) {
		value = d ? d.toString() : '';
		onchange?.(value);
	}
</script>

{#if name}<input type="hidden" {name} {value} />{/if}

<DatePicker.Root
	value={dateValue}
	onValueChange={set}
	bind:open
	onOpenChange={(o) => !o && onblur?.(new FocusEvent('blur'))}
	locale="id-ID"
	weekStartsOn={1}
	weekdayFormat="short"
	fixedWeeks
	closeOnDateSelect
>
	<DatePicker.Input
		{id}
		bind:ref={groupEl}
		onkeyup={recheck}
		onfocusout={onfocusout}
		aria-label={ariaLabel}
		aria-invalid={partial ? 'true' : ariaInvalid}
		aria-describedby={partial ? partialId : ariaDescribedby}
		class={cn(
			'dropdown-trigger flex h-10 w-full min-w-40 items-center gap-0.5 rounded-xl border border-input bg-field pr-1.5 pl-3 text-sm tabular-nums shadow-[0_2px_8px_-6px_rgb(20_33_15/0.25)] transition-[border-color,box-shadow] focus-within:border-green focus-within:ring-3 focus-within:ring-green/25 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
			open && 'border-green ring-3 ring-green/25',
			className
		)}
	>
		{#snippet children({ segments })}
			{#each segments as { part, value: segValue }, i (part + i)}
				{#if part === 'literal'}
					<DatePicker.Segment {part} class="px-0.5 text-muted-foreground">{segValue}</DatePicker.Segment>
				{:else}
					<DatePicker.Segment
						{part}
						class="rounded-md px-0.5 outline-none focus:bg-pale focus:text-deep aria-[valuetext=Empty]:text-muted-foreground data-placeholder:text-muted-foreground"
					>
						{segValue}
					</DatePicker.Segment>
				{/if}
			{/each}
			<DatePicker.Trigger
				aria-label="Buka kalender"
				class="ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-pale hover:text-deep"
			>
				<CalendarIcon class="size-4" />
			</DatePicker.Trigger>
		{/snippet}
	</DatePicker.Input>
	<DatePicker.Portal>
		<DatePicker.Content
			sideOffset={6}
			align="start"
			class="dropdown-panel z-[60] rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-[0_24px_48px_-20px_rgb(0_0_0/0.45)]"
		>
			<DatePicker.Calendar>
				{#snippet children({ months, weekdays })}
					<DatePicker.Header class="mb-2 flex items-center justify-between">
						<DatePicker.Heading class="text-sm font-bold capitalize" />
						<div class="flex gap-1">
							<DatePicker.PrevButton aria-label="Bulan sebelumnya" class="flex size-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-pale hover:text-deep">
								<ChevronLeft class="size-4" />
							</DatePicker.PrevButton>
							<DatePicker.NextButton aria-label="Bulan berikutnya" class="flex size-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-pale hover:text-deep">
								<ChevronRight class="size-4" />
							</DatePicker.NextButton>
						</div>
					</DatePicker.Header>
					{#each months as month (month.value.toString())}
						<DatePicker.Grid class="w-full border-collapse select-none">
							<DatePicker.GridHead>
								<DatePicker.GridRow class="flex">
									{#each weekdays as day, di (di)}
										<DatePicker.HeadCell class="w-9 pb-1 text-center text-[10px] font-medium text-muted-foreground">{day.slice(0, 3)}</DatePicker.HeadCell>
									{/each}
								</DatePicker.GridRow>
							</DatePicker.GridHead>
							<DatePicker.GridBody>
								{#each month.weeks as weekDates, wi (wi)}
									<DatePicker.GridRow class="flex">
										{#each weekDates as date (date.toString())}
											<DatePicker.Cell {date} month={month.value} class="p-0.5">
												<DatePicker.Day
													class="flex size-8 items-center justify-center rounded-lg text-sm tabular-nums transition-colors hover:bg-pale data-outside-month:text-muted-foreground/50 data-selected:bg-lime data-selected:font-bold data-selected:text-on-lime data-today:ring-1 data-today:ring-green data-disabled:opacity-40"
												/>
											</DatePicker.Cell>
										{/each}
									</DatePicker.GridRow>
								{/each}
							</DatePicker.GridBody>
						</DatePicker.Grid>
					{/each}
				{/snippet}
			</DatePicker.Calendar>
			<div class="mt-2 flex justify-between border-t border-border pt-2 text-xs font-medium">
				<button type="button" class="rounded-md px-2 py-1 text-deep hover:bg-pale" onclick={() => { set(today(getLocalTimeZone())); open = false; }}>Hari ini</button>
				<button type="button" class="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted" onclick={() => { set(undefined); open = false; }}>Hapus</button>
			</div>
		</DatePicker.Content>
	</DatePicker.Portal>
</DatePicker.Root>
{#if partial}
	<p id={partialId} role="alert" class="mt-1.5 text-xs font-medium text-destructive">Lengkapi tanggal (hari, bulan, dan tahun)</p>
{/if}
