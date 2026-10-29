<script lang="ts">
	import { goto } from '$app/navigation';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import { buildChangePlan, PlanError, type AdditionItem, type ChangePlan } from '$lib/coa-template-diff';
	import { cn } from '$lib/utils';

	let { data } = $props();

	type Action = 'rename' | 'keep';
	type Summary = { renamed: number; created: number; deactivated: number; reactivated: number; rulesAdded: number };

	// Keputusan awal diambil sekali dari data (snapshot); muat ulang halaman untuk data baru.
	const init = () => ({
		conflicts: Object.fromEntries(
			data.diff.conflicts.map((c) => [c.code, { action: (c.nameDiffers ? null : 'keep') as Action | null, reactivate: !c.current.isActive }])
		),
		missing: Object.fromEntries(data.diff.missing.map((m) => [m.accountId, 'keep' as 'keep' | 'deactivate'])),
		checked: Object.fromEntries(data.diff.additions.map((a) => [a.templateCode, !a.blocked]))
	});
	const initial = init();
	let conflictDec = $state(initial.conflicts);
	let missingDec = $state(initial.missing);
	let checked = $state(initial.checked);
	let step = $state(0);
	let busy = $state(false);
	let errorMessage = $state<string | null>(null);
	let stale = $state(false);
	let success = $state<string | null>(null);

	const conflicts = $derived(data.diff.conflicts);
	const missing = $derived(data.diff.missing);
	// Akun pengganti (source 'kept') hanya relevan bila konflik leaf-nya dipertahankan.
	const additions = $derived(
		data.diff.additions.filter((a) => a.source === 'new' || conflictDec[a.templateCode]?.action === 'keep')
	);
	const unresolved = $derived(conflicts.filter((c) => !conflictDec[c.code].action).length);

	const decisions = $derived({
		conflicts: Object.fromEntries(
			conflicts
				.filter((c) => conflictDec[c.code].action)
				.map((c) => [c.code, { action: conflictDec[c.code].action as Action, reactivate: conflictDec[c.code].reactivate }])
		),
		missing: { ...missingDec },
		skip: additions.filter((a) => !a.blocked && !checked[a.templateCode]).map((a) => a.templateCode)
	});

	const plan = $derived.by((): { ok: true; plan: ChangePlan } | { ok: false; message: string } => {
		try {
			return { ok: true, plan: buildChangePlan(data.diff, decisions) };
		} catch (e) {
			if (e instanceof PlanError) return { ok: false, message: e.message };
			throw e;
		}
	});
	const dupSet = $derived(new Set(plan.ok ? plan.plan.duplicateNames.map((n) => n.trim().toLowerCase()) : []));
	const isDup = (name: string) => dupSet.has(name.trim().toLowerCase());

	const steps = $derived([
		`1. Kode bentrok · ${conflicts.length}`,
		`2. Tidak ada di template · ${missing.length}`,
		`3. Akun baru · ${additions.length}`,
		'Ringkasan'
	]);

	// Mencentang anak ikut mencentang induk; menghapus centang induk ikut menghapus anaknya.
	function toggleAddition(a: AdditionItem, on: boolean) {
		const byCode = new Map(additions.map((x) => [x.code, x]));
		if (on) {
			for (let cur: AdditionItem | undefined = a; cur; cur = cur.parentCode ? byCode.get(cur.parentCode) : undefined) {
				if (!cur.blocked) checked[cur.templateCode] = true;
			}
		} else {
			const stack = [a];
			while (stack.length) {
				const cur = stack.pop()!;
				checked[cur.templateCode] = false;
				stack.push(...additions.filter((x) => x.parentCode === cur.code));
			}
		}
	}

	const depth = (a: AdditionItem) => {
		const byCode = new Map(additions.map((x) => [x.code, x]));
		let n = 0;
		for (let p = a.parentCode; p && byCode.has(p); p = byCode.get(p)!.parentCode) n++;
		return n;
	};

	const summaryText = (s: Pick<Summary, 'renamed' | 'created' | 'deactivated' | 'reactivated'>) =>
		`${s.renamed} akun diganti nama, ${s.created} akun ditambahkan, ${s.deactivated} akun dinonaktifkan, ${s.reactivated} diaktifkan kembali`;

	async function apply() {
		if (!plan.ok) return;
		busy = true;
		errorMessage = null;
		try {
			const res = await apiFetch<{ summary: Summary }>(`/api/companies/${data.companyId}/coa-template`, {
				method: 'POST',
				json: { target: data.target, fingerprint: data.fingerprint, ...decisions }
			});
			const s = res.summary;
			success = `Template bagan akun diganti: ${summaryText(s)}${s.rulesAdded ? `, ${s.rulesAdded} rule ditambahkan` : ''}.`;
			setTimeout(() => goto('/settings/accounts'), 1500);
		} catch (err) {
			if (err instanceof ClientApiError && err.status === 409) stale = true;
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
			busy = false;
		}
	}
</script>

{#snippet dupWarning(name: string)}
	{#if isDup(name)}
		<p class="mt-2 flex gap-2 rounded-xl bg-amber-500/10 p-2 text-xs"><TriangleAlert class="mt-px size-3.5 shrink-0 text-amber" />Nama “{name}” akan dipakai lebih dari satu akun aktif.</p>
	{/if}
{/snippet}

<PageHeader title="Ganti template bagan akun" description="Tujuan: {data.targetLabel}" crumb="Ganti template" />

{#if success}<Alert.Root class="mb-4"><Alert.Description>{success}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}
	<Alert.Root variant="destructive" class="mb-4">
		<Alert.Description class="flex flex-wrap items-center justify-between gap-3">
			<span>{errorMessage}</span>
			{#if stale}<Button size="sm" variant="outline" onclick={() => location.reload()}>Muat ulang</Button>{/if}
		</Alert.Description>
	</Alert.Root>
{/if}

<nav class="mb-4 flex flex-wrap gap-2" aria-label="Langkah">
	{#each steps as label, i (i)}
		<Button size="sm" variant={step === i ? 'default' : 'outline'} aria-current={step === i ? 'step' : undefined} onclick={() => (step = i)}>{label}</Button>
	{/each}
</nav>

<Card.Root class="max-w-3xl">
	<Card.Content class="space-y-3 pt-6">
		{#if step === 0}
			<p class="text-sm text-muted-foreground">Kode sama, arti berbeda. Tentukan satu per satu.</p>
			{#each conflicts as c (c.code)}
				{@const d = conflictDec[c.code]}
				{@const leafKeep = !c.isHeader && c.newCodeIfKept}
				<div class="rounded-xl border p-3 text-sm">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-semibold">{c.code}</span>
						<span class="text-muted-foreground">· dipakai {c.journalLines} jurnal</span>
						{#if !c.current.isActive}<Badge variant="muted">Nonaktif</Badge>{/if}
					</div>
					{#if c.nameDiffers}
						<p class="mt-1">Sekarang: <strong>{c.current.name}</strong> → Template: <strong>{c.target.name}</strong></p>
						<div class="mt-2 space-y-1">
							<label class={cn('flex items-start gap-2', !c.renameAllowed && 'opacity-60')}>
								<input type="radio" class="mt-1 accent-primary" name="conflict-{c.code}" value="rename" bind:group={d.action} disabled={!c.renameAllowed} />
								<span>
									Ganti nama jadi {c.target.name}
									{#if !c.renameAllowed}<span class="block text-xs text-muted-foreground">Saldo normal/tipe berbeda dan akun sudah dipakai jurnal</span>{/if}
								</span>
							</label>
							<label class="flex items-start gap-2">
								<input type="radio" class="mt-1 accent-primary" name="conflict-{c.code}" value="keep" bind:group={d.action} />
								<span>Tetap {c.current.name}{#if leafKeep}, akun template dibuat dengan kode {c.newCodeIfKept}{/if}</span>
							</label>
						</div>
					{:else}
						<p class="mt-1">{c.current.name}</p>
					{/if}
					{#if !c.current.isActive}
						<label class="mt-2 flex items-center gap-2">
							<input type="checkbox" class="size-4 accent-primary" checked={d.action === 'rename' || d.reactivate} disabled={d.action === 'rename'} onchange={(e) => (d.reactivate = e.currentTarget.checked)} />
							Aktifkan kembali
						</label>
					{/if}
					{#if d.action}
						{@render dupWarning(d.action === 'rename' ? c.target.name : c.current.name)}
						{#if d.action === 'keep' && leafKeep && checked[c.code]}{@render dupWarning(c.target.name)}{/if}
					{/if}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">Tidak ada</p>
			{/each}
		{:else if step === 1}
			<p class="text-sm text-muted-foreground">Akun ini tidak ada di template tujuan. Biarkan, atau nonaktifkan bila tidak dipakai lagi.</p>
			{#each missing as m (m.accountId)}
				<div class="rounded-xl border p-3 text-sm">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-semibold">{m.code}</span>
						<span>{m.name}</span>
						<span class="text-muted-foreground">· dipakai {m.journalLines} jurnal</span>
					</div>
					<div class="mt-2 flex flex-wrap gap-4">
						<label class="flex items-center gap-2">
							<input type="radio" class="accent-primary" name="missing-{m.accountId}" value="keep" bind:group={missingDec[m.accountId]} />
							Biarkan
						</label>
						<label class={cn('flex items-center gap-2', m.isBankAccount && 'opacity-60')}>
							<input type="radio" class="accent-primary" name="missing-{m.accountId}" value="deactivate" bind:group={missingDec[m.accountId]} disabled={m.isBankAccount} />
							Nonaktifkan
						</label>
					</div>
					{#if m.isBankAccount}<p class="mt-1 text-xs text-muted-foreground">Akun bank perusahaan tidak bisa dinonaktifkan</p>{/if}
					{#if missingDec[m.accountId] === 'keep'}{@render dupWarning(m.name)}{/if}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">Tidak ada</p>
			{/each}
		{:else if step === 2}
			<p class="text-sm text-muted-foreground">Akun dari template tujuan yang belum ada. Hapus centang untuk melewatinya.</p>
			{#each additions as a (a.templateCode)}
				<div class="rounded-xl border p-3 text-sm" style:margin-left="{depth(a) * 1.25}rem">
					<label class={cn('flex items-start gap-2', a.blocked && 'opacity-60')}>
						<input type="checkbox" class="mt-0.5 size-4 accent-primary" checked={!a.blocked && checked[a.templateCode]} disabled={!!a.blocked} onchange={(e) => toggleAddition(a, e.currentTarget.checked)} />
						<span>
							<span class="font-semibold">{a.code}</span> {a.name}
							{#if a.source === 'kept'}<span class="block text-xs text-muted-foreground">Pengganti kode {a.templateCode} yang namanya dipertahankan</span>{/if}
							{#if a.blocked}<span class="block text-xs text-muted-foreground">Induknya akun yang sudah dipakai transaksi</span>{/if}
						</span>
					</label>
					{#if !a.blocked && checked[a.templateCode]}{@render dupWarning(a.name)}{/if}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">Tidak ada</p>
			{/each}
		{:else}
			{#if plan.ok}
				<p class="text-sm">
					{summaryText({ renamed: plan.plan.renames.length, created: plan.plan.creates.length, deactivated: plan.plan.deactivate.length, reactivated: plan.plan.reactivate.length })}
				</p>
				{#if plan.plan.duplicateNames.length}
					<p role="status" class="flex gap-2 rounded-xl bg-amber-500/10 p-3 text-sm">
						<TriangleAlert class="mt-0.5 size-4 shrink-0 text-amber" />Beberapa akun aktif akan bernama sama: {plan.plan.duplicateNames.join(', ')}. Periksa lagi pilihan di langkah sebelumnya, atau ubah namanya setelah diterapkan.
					</p>
				{/if}
			{:else}
				<p role="status" class="flex gap-2 rounded-xl bg-amber-500/10 p-3 text-sm"><TriangleAlert class="mt-0.5 size-4 shrink-0 text-amber" />Belum lengkap: {plan.message}</p>
			{/if}
		{/if}
	</Card.Content>
	<Card.Footer class="flex flex-wrap items-center justify-between gap-3">
		<span class="text-sm text-muted-foreground">
			{#if step === 0}{unresolved} dari {conflicts.length} belum dipilih{/if}
		</span>
		<div class="flex gap-2">
			{#if step > 0}<Button variant="ghost" onclick={() => step--}>Kembali</Button>{/if}
			{#if step < 3}
				<Button disabled={step === 0 && unresolved > 0} onclick={() => step++}>Lanjut</Button>
			{:else}
				<Button disabled={!plan.ok || busy || !!success || stale} onclick={apply}>Terapkan</Button>
			{/if}
		</div>
	</Card.Footer>
</Card.Root>
