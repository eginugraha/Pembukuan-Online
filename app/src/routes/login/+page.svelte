<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	let { form } = $props();
	let submitting = $state(false);
</script>

<div class="flex min-h-screen items-center justify-center bg-slate-50 p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title class="text-2xl">Jurnalku</Card.Title>
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
					<p class="text-sm text-red-600">{form.message}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={submitting}>
					{submitting ? 'Memproses…' : 'Masuk'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
