import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreateInvoiceInput } from '$lib/schemas/invoice';

const UUID = '00000000-0000-4000-8000-000000000000';
const base = { contactId: UUID, issueDate: '2026-10-01', lines: [{ description: 'Jasa', quantity: '1', unitPrice: '10000' }] };

test('requires contact, issue date, and at least one line', () => {
	const e = fieldErrors(CreateInvoiceInput, { lines: [] });
	expect(e.contactId).toBeDefined();
	expect(e.issueDate).toBeDefined();
	expect(e.lines).toBe('Isi minimal satu baris');
});

test('a line with a zero amount is rejected', () => {
	expect(fieldErrors(CreateInvoiceInput, { ...base, lines: [{ description: 'Jasa', quantity: '1', unitPrice: '0' }] }).lines).toBeDefined();
});

test('no account fields are required (documents do not touch the ledger)', () => {
	expect(fieldErrors(CreateInvoiceInput, base)).toEqual({});
	expect(fieldErrors(CreateInvoiceInput, { ...base, taxRate: '11' })).toEqual({});
});

test('tax rate over 100 is rejected', () => {
	expect(fieldErrors(CreateInvoiceInput, { ...base, taxRate: '100.01' }).taxRate).toBe('Tarif PPN maksimal 100%');
});
