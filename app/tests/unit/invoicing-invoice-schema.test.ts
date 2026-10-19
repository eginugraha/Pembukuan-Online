import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreateInvoiceInput } from '$lib/schemas/invoice';

const UUID = '00000000-0000-4000-8000-000000000000';

test('requires contact, issue date, receivable account, and at least one line', () => {
	const e = fieldErrors(CreateInvoiceInput, { lines: [] });
	expect(e.contactId).toBeDefined();
	expect(e.issueDate).toBeDefined();
	expect(e.receivableAccountId).toBeDefined();
	expect(e.lines).toBe('Isi minimal satu baris');
});

test('a line with a zero amount or missing account is rejected', () => {
	const base = { contactId: UUID, issueDate: '2026-10-01', receivableAccountId: UUID };
	expect(fieldErrors(CreateInvoiceInput, { ...base, lines: [{ description: 'Jasa', quantity: '1', unitPrice: '0' }] }).lines).toBeDefined();
});

test('taxRate without taxAccountId is rejected', () => {
	const base = { contactId: UUID, issueDate: '2026-10-01', receivableAccountId: UUID, lines: [{ description: 'Jasa', quantity: '1', unitPrice: '10000', revenueAccountId: UUID }] };
	expect(fieldErrors(CreateInvoiceInput, { ...base, taxRate: '11' }).taxAccountId).toBeDefined();
	expect(fieldErrors(CreateInvoiceInput, { ...base, taxRate: '11', taxAccountId: UUID })).toEqual({});
});
