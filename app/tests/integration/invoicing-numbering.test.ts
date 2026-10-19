import { beforeEach, expect, test } from 'bun:test';
import { db } from '../../src/lib/server/db';
import { nextDocumentNumber } from '../../src/lib/server/invoicing/numbering';
import { makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('numbers are sequential per company, per prefix, per year, starting at 0001', async () => {
	const { companyId } = await makeCompany();
	await db.transaction(async (tx) => {
		expect(await nextDocumentNumber(tx, companyId, 'INV', '2026')).toBe('INV-2026-0001');
		expect(await nextDocumentNumber(tx, companyId, 'INV', '2026')).toBe('INV-2026-0002');
	});
});

test('different prefixes and different years each have their own independent sequence', async () => {
	const { companyId } = await makeCompany();
	await db.transaction(async (tx) => {
		expect(await nextDocumentNumber(tx, companyId, 'PO', '2026')).toBe('PO-2026-0001');
		expect(await nextDocumentNumber(tx, companyId, 'INV', '2026')).toBe('INV-2026-0001');
		expect(await nextDocumentNumber(tx, companyId, 'INV', '2027')).toBe('INV-2027-0001');
	});
});

test('two companies never share a sequence', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	await db.transaction(async (tx) => {
		expect(await nextDocumentNumber(tx, a.companyId, 'INV', '2026')).toBe('INV-2026-0001');
		expect(await nextDocumentNumber(tx, b.companyId, 'INV', '2026')).toBe('INV-2026-0001');
	});
});
