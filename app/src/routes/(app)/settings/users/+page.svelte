<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch } from '$lib/api-client';
	import { ROLE_LABELS, ROLES, type Role } from '$lib/roles';
	import { selectClass } from '$lib/ui';

	let { data } = $props();
	let form = $state({ email: '', name: '', password: '', role: 'viewer' as Role });
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

	const add = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			const res = await apiFetch<{ created: boolean }>('/api/users', {
				method: 'POST',
				json: { email: form.email, role: form.role, name: form.name || undefined, password: form.password || undefined }
			});
			form = { email: '', name: '', password: '', role: 'viewer' };
			return res.created ? 'Pengguna baru dibuat dan ditambahkan.' : 'Pengguna yang sudah ada ditambahkan ke perusahaan.';
		});
	};
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
		<form class="grid gap-2 md:grid-cols-5" onsubmit={add}>
			<Input type="email" placeholder="Email" bind:value={form.email} required />
			<Input placeholder="Nama (pengguna baru)" bind:value={form.name} />
			<Input type="password" placeholder="Password awal (min. 8)" bind:value={form.password} />
			<select class={selectClass} bind:value={form.role} aria-label="Role">
				{#each ROLES as r (r)}<option value={r}>{ROLE_LABELS[r]}</option>{/each}
			</select>
			<Button type="submit">Tambah</Button>
		</form>
	</Card.Content>
</Card.Root>

<Table.Root>
	<Table.Header>
		<Table.Row><Table.Head>Nama</Table.Head><Table.Head>Email</Table.Head><Table.Head>Role</Table.Head><Table.Head></Table.Head></Table.Row>
	</Table.Header>
	<Table.Body>
		{#each data.members as m (m.userId)}
			<Table.Row>
				<Table.Cell>{m.name} {#if m.isSuperAdmin}<Badge variant="secondary">Super admin</Badge>{/if}</Table.Cell>
				<Table.Cell>{m.email}</Table.Cell>
				<Table.Cell>
					<select class="{selectClass} w-36" value={m.role} onchange={(e) => setRole(m.userId, e.currentTarget.value)} aria-label="Role {m.email}">
						{#each ROLES as r (r)}<option value={r}>{ROLE_LABELS[r]}</option>{/each}
					</select>
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
