import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreatePurchaseOrderInput } from '$lib/schemas/purchase-order';

test('requires contact, issue date, payable account, and at least one line', () => {
	const e = fieldErrors(CreatePurchaseOrderInput, { lines: [] });
	expect(e.contactId).toBeDefined();
	expect(e.issueDate).toBeDefined();
	expect(e.payableAccountId).toBeDefined();
	expect(e.lines).toBe('Isi minimal satu baris');
});
