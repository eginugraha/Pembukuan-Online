import type { z } from 'zod';
import { ClientApiError } from '$lib/api-client';
import { fieldErrors } from './validation';

/**
 * State validasi satu form.
 * - Error klien tampil setelah field di-blur (`touch`) atau setelah submit pertama; sesudah itu dihitung ulang tiap ketik.
 * - Error server per field disimpan bersama nilai saat dikirim, dan otomatis hilang begitu nilai field berubah.
 */
export class FormState<T extends Record<string, unknown>> {
	values: T;
	#touched = $state<Record<string, boolean>>({});
	#submitted = $state(false);
	#server = $state<Record<string, { message: string; value: unknown }>>({});
	#clientErrors = $derived.by(() => fieldErrors(this.schema, this.toInput(this.values)));

	constructor(
		private schema: z.ZodType,
		initial: T,
		private toInput: (values: T) => unknown = (v) => v
	) {
		this.values = $state(initial);
	}

	error(field: keyof T & string): string | undefined {
		const s = this.#server[field];
		if (s && Object.is(s.value, this.values[field])) return s.message;
		return this.#submitted || this.#touched[field] ? this.#clientErrors[field] : undefined;
	}

	/** Atribut aksesibilitas untuk input milik `field`. */
	attrs(field: keyof T & string, id: string) {
		const invalid = !!this.error(field);
		return {
			id,
			'aria-invalid': invalid ? ('true' as const) : undefined,
			'aria-describedby': invalid ? `${id}-error` : undefined,
			onblur: () => this.touch(field)
		};
	}

	touch(field: keyof T & string) {
		this.#touched[field] = true;
	}

	/** Tandai submit; true bila semua field lolos validasi klien. */
	validateAll(): boolean {
		this.#submitted = true;
		this.#server = {};
		return Object.keys(this.#clientErrors).length === 0;
	}

	/**
	 * Tampilkan error dari server. Mengembalikan pesan yang tidak terkait field form (untuk Alert umum),
	 * atau null bila semua error sudah tertampil di field.
	 */
	handleServerError(err: unknown): string | null {
		if (!(err instanceof ClientApiError)) return err instanceof Error ? err.message : 'Terjadi kesalahan';
		const next: Record<string, { message: string; value: unknown }> = {};
		for (const [field, message] of Object.entries(err.fields)) {
			if (field in this.values) next[field] = { message, value: this.values[field as keyof T] };
		}
		this.#server = next;
		return Object.keys(next).length > 0 ? null : err.message;
	}

	reset(values: T) {
		Object.assign(this.values, values);
		this.#touched = {};
		this.#submitted = false;
		this.#server = {};
	}
}
