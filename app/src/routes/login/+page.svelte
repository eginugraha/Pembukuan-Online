<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import FormField from '$lib/components/FormField.svelte';
	import ThemeSelect from '$lib/components/ThemeSelect.svelte';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { LoginInput } from '$lib/schemas/login';

	let { form } = $props();
	let submitting = $state(false);
	// svelte-ignore state_referenced_locally
	const fs = new FormState(LoginInput, { email: form?.email ?? '', password: '' });
	// Tanpa JavaScript, error field datang dari action server.
	const errorOf = (f: 'email' | 'password') => fs.error(f) ?? form?.fieldErrors?.[f];
	// aria-invalid/describedby ikut error dari server juga, supaya benar tanpa JavaScript.
	const attrs = (f: 'email' | 'password') => ({
		...fs.attrs(f, f),
		'aria-invalid': errorOf(f) ? ('true' as const) : undefined,
		'aria-describedby': errorOf(f) ? `${f}-error` : undefined
	});
</script>

<div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas p-4">
	<!-- Aksen dekoratif lime di sudut, seperti referensi -->
	<div class="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[image:var(--login-blob-1)] opacity-90 blur-[2px]"></div>
	<div class="pointer-events-none absolute -bottom-28 -left-20 size-64 rounded-full bg-[image:var(--login-blob-2)] opacity-30"></div>

	<div class="absolute top-4 right-4 z-10"><ThemeSelect compact /></div>
	<Card.Root class="relative w-full max-w-sm rounded-[28px] px-2 py-8 shadow-[0_30px_60px_-30px_rgb(30_50_30/0.45)]">
		<Card.Header class="items-center text-center">
			<span class="icon-tile icon-tile-deep mx-auto mb-3 size-14 rounded-2xl text-2xl font-black">J</span>
			<Card.Title class="text-2xl font-extrabold tracking-tight text-green">Jurnalku.</Card.Title>
			<Card.Description>Masuk untuk melanjutkan</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				class="space-y-4"
				novalidate
				use:enhance={({ formData, cancel }) => {
					// Validasi isi yang benar-benar dikirim: autofill browser/password manager bisa mengisi
					// field tanpa memicu event input, sehingga state reaktif masih kosong.
					fs.values.email = String(formData.get('email') ?? '');
					fs.values.password = String(formData.get('password') ?? '');
					if (!fs.validateAll()) return cancel();
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<FormField id="email" label="Email" error={errorOf('email')}>
					<Input name="email" type="email" autocomplete="username" bind:value={fs.values.email} {...attrs('email')} />
				</FormField>
				<FormField id="password" label="Password" error={errorOf('password')}>
					<Input name="password" type="password" autocomplete="current-password" bind:value={fs.values.password} {...attrs('password')} />
				</FormField>
				{#if form?.message}
					<p class="rounded-xl bg-destructive/5 px-3 py-2 text-sm text-destructive">{form.message}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={submitting}>
					{submitting ? 'Memproses…' : 'Masuk'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
