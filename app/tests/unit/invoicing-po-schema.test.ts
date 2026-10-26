import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreatePurchaseOrderInput } from '$lib/schemas/purchase-order';

test('requires contact, and issue date, and at least one line', () => {
	const e = fieldErrors(CreatePurchaseOrderInput, { lines: [] });
	expect(e.contactId).toBeDefined();
	expect(e.issueDate).toBeDefined();
	expect(e.lines).toBe('Isi minimal satu baris');
});

test('no account fields are required (documents do not touch the ledger)', () => {
	expect(
		fieldErrors(CreatePurchaseOrderInput, {
			contactId: '3f1f4c3e-8a67-4f5e-9d6c-0b1a2c3d4e5f',
			issueDate: '2026-10-01',
			taxRate: '11',
			lines: [{ description: 'Sewa', quantity: '1', unitPrice: '100' }]
		})
	).toEqual({});
});

test('currency must be IDR or USD', () => {
	const base = { contactId: '3f1f4c3e-8a67-4f5e-9d6c-0b1a2c3d4e5f', issueDate: '2026-10-01', lines: [{ description: 'Sewa', quantity: '1', unitPrice: '100' }] };
	expect(fieldErrors(CreatePurchaseOrderInput, { ...base, currency: 'USD' })).toEqual({});
	expect(fieldErrors(CreatePurchaseOrderInput, { ...base, currency: 'EUR' }).currency).toBe('Mata uang tidak valid');
});
