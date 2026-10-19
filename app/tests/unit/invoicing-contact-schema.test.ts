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
