<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	let { form } = $props();
	let submitting = $state(false);
</script>

<div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas p-4">
	<!-- Aksen dekoratif lime di sudut, seperti referensi -->
	<div class="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[radial-gradient(circle_at_35%_35%,#e3fccd,var(--lime)_55%,var(--lime-2))] opacity-90 blur-[2px]"></div>
	<div class="pointer-events-none absolute -bottom-28 -left-20 size-64 rounded-full bg-[radial-gradient(circle_at_60%_40%,#b6e08f,var(--green))] opacity-30"></div>

	<Card.Root class="relative w-full max-w-sm rounded-[28px] px-2 py-8 shadow-[0_30px_60px_-30px_rgb(30_50_30/0.45)]">
		<Card.Header class="items-center text-center">
			<span class="tile-3d tile-3d-deep mx-auto mb-3 size-14 rounded-2xl text-2xl font-black">J</span>
			<Card.Title class="text-2xl font-extrabold tracking-tight text-green">Jurnalku.</Card.Title>
			<Card.Description>Masuk untuk melanjutkan</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				class="space-y-4"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" name="email" type="email" autocomplete="username" value={form?.email ?? ''} required />
				</div>
				<div class="space-y-2">
					<Label for="password">Password</Label>
					<Input id="password" name="password" type="password" autocomplete="current-password" required />
				</div>
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
