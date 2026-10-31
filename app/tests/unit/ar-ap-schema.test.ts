import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreateArApInput, UpdateArApInput } from '$lib/schemas/ar-ap';

const UUID = '00000000-0000-4000-8000-000000000000';
const base = { kind: 'AR', contactId: UUID, title: 'Proyek A', total: '1000', currency: 'IDR', paid: false, terms: [] };
const term = (n: string) => ({ name: n, percent: '50', paid: false });

test('no terms is valid', () => {
	expect(fieldErrors(CreateArApInput, base)).toEqual({});
});

test('a single term is rejected, two are accepted', () => {
	expect(fieldErrors(CreateArApInput, { ...base, terms: [term('DP')] }).terms).toBeDefined();
	expect(fieldErrors(CreateArApInput, { ...base, terms: [term('DP'), term('Pelunasan')] })).toEqual({});
});

test('zero total is rejected', () => {
	expect(fieldErrors(CreateArApInput, { ...base, total: '0' }).total).toBeDefined();
});

test('unsupported currency is rejected', () => {
	expect(fieldErrors(CreateArApInput, { ...base, currency: 'EUR' }).currency).toBe('Mata uang tidak valid');
});

test('a term needs percent or amount', () => {
	const e = fieldErrors(CreateArApInput, { ...base, terms: [{ name: 'DP', paid: false }, term('Lunas')] });
	expect(Object.keys(e).length).toBeGreaterThan(0);
});

test('title and kind are required', () => {
	const e = fieldErrors(CreateArApInput, { ...base, title: '', kind: 'X' });
	expect(e.title).toBeDefined();
	expect(e.kind).toBeDefined();
});

test('documentId must be a uuid; empty string becomes null', () => {
	const t = (documentId: unknown) => ({ ...term('DP'), documentId });
	expect(fieldErrors(CreateArApInput, { ...base, documentId: UUID })).toEqual({});
	expect(fieldErrors(CreateArApInput, { ...base, documentId: 'bukan-uuid' }).documentId).toBe('Dokumen tidak valid');
	expect(fieldErrors(CreateArApInput, { ...base, terms: [t('bukan-uuid'), term('Lunas')] })).not.toEqual({});
	expect(fieldErrors(CreateArApInput, { ...base, terms: [t(UUID), term('Lunas')] })).toEqual({});
	const r = CreateArApInput.parse({ ...base, documentId: '', terms: [t(''), term('Lunas')] });
	expect(r.documentId).toBeNull();
	expect(r.terms[0].documentId).toBeNull();
});

test('UpdateArApInput: snapshot is optional; when given it must be well formed', () => {
	expect(fieldErrors(UpdateArApInput, base)).toEqual({});
	expect(fieldErrors(UpdateArApInput, { ...base, snapshot: [{ id: UUID, paid: true, documentId: null }] })).toEqual({});
	expect(fieldErrors(UpdateArApInput, { ...base, snapshot: [{ id: UUID, paid: true, documentId: UUID }] })).toEqual({});
	expect(Object.keys(fieldErrors(UpdateArApInput, { ...base, snapshot: [{ id: 'x', paid: true, documentId: null }] })).length).toBeGreaterThan(0);
	expect(CreateArApInput.safeParse({ ...base, snapshot: [] }).data).not.toHaveProperty('snapshot');
});
