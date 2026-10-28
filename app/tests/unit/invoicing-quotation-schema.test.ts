import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreateQuotationInput } from '$lib/schemas/quotation';

const UUID = '00000000-0000-4000-8000-000000000000';
const base = { contactId: UUID, issueDate: '2026-10-29', lines: [{ description: 'Jasa', quantity: '1', unitPrice: '10000' }] };

test('valid until is optional', () => {
	expect(fieldErrors(CreateQuotationInput, base)).toEqual({});
	expect(fieldErrors(CreateQuotationInput, { ...base, validUntil: '2026-10-29' })).toEqual({});
});

test('valid until may not precede the quotation date', () => {
	expect(fieldErrors(CreateQuotationInput, { ...base, validUntil: '2026-10-28' }).validUntil).toBe('Berlaku sampai tidak boleh sebelum tanggal penawaran');
});

test('requires contact, date, and at least one line', () => {
	const e = fieldErrors(CreateQuotationInput, { lines: [] });
	expect(e.contactId).toBeDefined();
	expect(e.issueDate).toBeDefined();
	expect(e.lines).toBe('Isi minimal satu baris');
});
