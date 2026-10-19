import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreateAdvanceReceiptInput } from '$lib/schemas/advance-receipt';

test('requires contact, date, a positive amount, and an account', () => {
	const e = fieldErrors(CreateAdvanceReceiptInput, { amount: '0' });
	expect(e.contactId).toBeDefined();
	expect(e.receiptDate).toBeDefined();
	expect(e.amount).toBe('Jumlah harus lebih dari 0');
	expect(e.deferredRevenueAccountId).toBeDefined();
});
