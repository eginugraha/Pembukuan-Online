<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch } from '$lib/api-client';
	import { ROLE_LABELS, ROLES, type Role } from '$lib/roles';
	import FormField from '$lib/components/FormField.svelte';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { AddMemberInput } from '$lib/schemas/member';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';

	let { data } = $props();
	const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
	const EMPTY = { email: '', name: '', password: '', role: 'viewer' as Role };
	const toInput = (v: typeof EMPTY) => ({ email: v.email, role: v.role, name: v.name || undefined, password: v.password || undefined });
	const form = new FormState(AddMemberInput, { ...EMPTY }, toInput);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function run(fn: () => Promise<string>) {
		message = errorMessage = null;
		try {
			message = await fn();
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		}
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		message = errorMessage = null;
		if (!form.validateAll()) return;
		try {
			const res = await apiFetch<{ created: boolean }>('/api/users', { method: 'POST', json: toInput(form.values) });
			form.reset({ ...EMPTY });
			message = res.created ? 'Pengguna baru dibuat dan ditambahkan.' : 'Pengguna yang sudah ada ditambahkan ke perusahaan.';
			await invalidateAll();
		} catch (err) {
			errorMessage = form.handleServerError(err);
		}
	}
	const setRole = (userId: string, role: string) =>
		run(async () => {
			await apiFetch(`/api/users/${userId}/role`, { method: 'PATCH', json: { role } });
			return 'Role diperbarui.';
		});
	const remove = (userId: string) =>
		run(async () => {
			await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
			return 'Pengguna dilepas dari perusahaan.';
		});
	const toggleSuper = (userId: string, value: boolean) =>
		run(async () => {
			await apiFetch(`/api/users/${userId}/super-admin`, { method: 'PATCH', json: { value } });
			return value ? 'Dijadikan super admin.' : 'Status super admin dicabut.';
		});
</script>

<PageHeader title="Pengguna & Role" />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<Card.Root class="mb-6">
	<Card.Header>
		<Card.Title>Tambah pengguna</Card.Title>
		<Card.Description>Jika email sudah terdaftar, cukup isi email dan role. Pengguna baru wajib diberi nama dan password awal.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form class="grid items-start gap-3 md:grid-cols-[1.4fr_1.2fr_1.2fr_1fr_auto]" onsubmit={add} novalidate>
			<FormField id="mem-email" label="Email" error={form.error('email')}>
				<Input type="email" autocomplete="off" bind:value={form.values.email} {...form.attrs('email', 'mem-email')} />
			</FormField>
			<FormField id="mem-name" label="Nama" error={form.error('name')} hint="Wajib untuk pengguna baru">
				<Input bind:value={form.values.name} {...form.attrs('name', 'mem-name')} />
			</FormField>
			<FormField id="mem-password" label="Password awal" error={form.error('password')} hint="Min. 8 karakter, untuk pengguna baru">
				<Input type="password" autocomplete="new-password" bind:value={form.values.password} {...form.attrs('password', 'mem-password')} />
			</FormField>
			<FormField id="mem-role" label="Role">
				<SimpleSelect id="mem-role" bind:value={form.values.role} options={ROLE_OPTIONS} />
			</FormField>
			<Button type="submit" class="md:mt-[22px]">Tambah</Button>
		</form>
	</Card.Content>
</Card.Root>

<div class="panel px-2 py-1">
<Table.Root>
	<Table.Header>
		<Table.Row><Table.Head>Nama</Table.Head><Table.Head>Email</Table.Head><Table.Head>Role</Table.Head><Table.Head></Table.Head></Table.Row>
	</Table.Header>
	<Table.Body>
		{#each data.members as m (m.userId)}
			<Table.Row>
				<Table.Cell><span class="flex items-center gap-2.5"><UserAvatar name={m.name} image={m.image} class="size-8 text-xs" />{m.name} {#if m.isSuperAdmin}<Badge variant="secondary">Super admin</Badge>{/if}</span></Table.Cell>
				<Table.Cell>{m.email}</Table.Cell>
				<Table.Cell>
					<SimpleSelect class="w-36" value={m.role} options={ROLE_OPTIONS} aria-label="Role {m.email}" onchange={(v) => setRole(m.userId, v)} />
				</Table.Cell>
				<Table.Cell class="space-x-2 text-right">
					{#if data.isSuperAdmin && m.userId !== data.me}
						<Button size="sm" variant="ghost" onclick={() => toggleSuper(m.userId, !m.isSuperAdmin)}>
							{m.isSuperAdmin ? 'Cabut super admin' : 'Jadikan super admin'}
						</Button>
					{/if}
					<Button size="sm" variant="ghost" onclick={() => remove(m.userId)}>Lepas</Button>
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
</div>
