import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreateContactInput } from '$lib/schemas/contact';

test('name and kind are required, in Indonesian', () => {
	const e = fieldErrors(CreateContactInput, {});
	expect(e.name).toBe('Nama wajib diisi');
	expect(e.kind).toBeDefined();
});

test('valid minimal input passes', () => {
	expect(fieldErrors(CreateContactInput, { kind: 'CUSTOMER', name: 'PT Mitra' })).toEqual({});
});

test('attention and position are optional but length-limited', () => {
	expect(fieldErrors(CreateContactInput, { kind: 'CUSTOMER', name: 'PT', attention: 'Budi', position: 'Manajer' })).toEqual({});
	expect(fieldErrors(CreateContactInput, { kind: 'CUSTOMER', name: 'PT', attention: 'x'.repeat(201) }).attention).toBe('Attention maksimal 200 karakter');
});
