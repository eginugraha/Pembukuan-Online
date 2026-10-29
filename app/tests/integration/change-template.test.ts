import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, categoryRules, journalEntries, journalLines } from '../../src/lib/server/db/schema';
import { applyTemplateChange, loadSnapshot, previewTemplateChange } from '../../src/lib/server/company/change-template';
import { COA_TEMPLATE_DATA } from '../../src/lib/server/company/templates';
import type { TemplateDiff } from '../../src/lib/coa-template-diff';
import { accountIdByCode, makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const allRename = (diff: TemplateDiff) =>
	Object.fromEntries(diff.conflicts.map((c) => [c.code, { action: 'rename' as const, reactivate: false }]));

/** Satu jurnal seimbang: debit akun `accountId`, kredit akun bank. */
async function postLineOn(companyId: string, accountId: string) {
	const bank = await accountIdByCode(companyId, '1-1002');
	const [e] = await db.insert(journalEntries).values({ companyId, type: 'OPENING', entryDate: '2026-08-01' }).returning();
	await db.insert(journalLines).values([
		{ journalId: e.id, accountId, debit: '1000' },
		{ journalId: e.id, accountId: bank, credit: '1000' }
	]);
}

const rulesOf = (companyId: string) => db.select().from(categoryRules).where(eq(categoryRules.companyId, companyId));

test('apply Umum → IT: renames, adds, keeps journals on same account', async () => {
	const { companyId } = await makeCompany();
	const landId = await accountIdByCode(companyId, '1-2101');
	await postLineOn(companyId, landId);
	const { diff, fingerprint } = await previewTemplateChange(companyId, 'it');
	const conflicts = Object.fromEntries(
		diff.conflicts.map((c) => [c.code, { action: c.code === '1-2101' ? 'keep' : 'rename', reactivate: false }])
	) as Record<string, { action: 'rename' | 'keep'; reactivate: boolean }>;
	const s = await applyTemplateChange(companyId, { target: 'it', fingerprint, conflicts, missing: {}, skip: [] });
	expect(s).toMatchObject({ renamed: 24, created: 20, deactivated: 0 });
	const land = await db.query.accounts.findFirst({ where: eq(accounts.id, landId) });
	expect(land!.name).toBe('Tanah');
	expect(await accountIdByCode(companyId, '1-2106')).toBeTruthy();
	const lines = await db.select().from(journalLines).where(eq(journalLines.accountId, landId));
	expect(lines.length).toBeGreaterThan(0);
});

test('existing rules untouched, IT rules added, TOKOPEDIA still on same account', async () => {
	const { companyId } = await makeCompany();
	const before = await rulesOf(companyId);
	const tokped = before.find((r) => r.keywordPattern === 'TOKOPEDIA')!;
	const { diff, fingerprint } = await previewTemplateChange(companyId, 'it');
	const s = await applyTemplateChange(companyId, { target: 'it', fingerprint, conflicts: allRename(diff), missing: {}, skip: [] });
	const after = await rulesOf(companyId);
	expect(after.find((r) => r.id === tokped.id)!.accountId).toBe(tokped.accountId);
	const have = new Set(before.map((r) => `${r.keywordPattern.toLowerCase()}|${r.direction}`));
	const expected = new Set(
		COA_TEMPLATE_DATA.it.rules.map((r) => `${r.keyword.toLowerCase()}|${r.direction}`).filter((k) => !have.has(k))
	).size;
	expect(s.rulesAdded).toBe(expected);
	expect(after.length).toBe(before.length + expected);
});

test('apply rejects stale fingerprint', async () => {
	const { companyId } = await makeCompany();
	const { diff, fingerprint } = await previewTemplateChange(companyId, 'it');
	await db.update(accounts).set({ name: 'Diubah' }).where(eq(accounts.id, await accountIdByCode(companyId, '1-1001')));
	await expect(
		applyTemplateChange(companyId, { target: 'it', fingerprint, conflicts: allRename(diff), missing: {}, skip: [] })
	).rejects.toMatchObject({ status: 409, code: 'coa_changed' });
});

test('plan error is 422 and nothing changes', async () => {
	const { companyId } = await makeCompany();
	const { fingerprint } = await previewTemplateChange(companyId, 'it');
	await expect(
		applyTemplateChange(companyId, { target: 'it', fingerprint, conflicts: {}, missing: {}, skip: [] })
	).rejects.toMatchObject({ status: 422, code: 'incomplete' });
	expect((await loadSnapshot(db, companyId)).fingerprint).toBe(fingerprint);
});

test('deactivate missing 1-2105 sets isActive false, does not delete', async () => {
	const { companyId } = await makeCompany();
	const id = await accountIdByCode(companyId, '1-2105');
	const { diff, fingerprint } = await previewTemplateChange(companyId, 'it');
	expect(diff.missing.map((m) => m.accountId)).toContain(id);
	const s = await applyTemplateChange(companyId, {
		target: 'it',
		fingerprint,
		conflicts: allRename(diff),
		missing: { [id]: 'deactivate' },
		skip: []
	});
	expect(s.deactivated).toBe(1);
	const row = await db.query.accounts.findFirst({ where: eq(accounts.id, id) });
	expect(row!.isActive).toBe(false);
});

test('apply twice (IT → IT) is a no-op', async () => {
	const { companyId } = await makeCompany();
	const first = await previewTemplateChange(companyId, 'it');
	await applyTemplateChange(companyId, { target: 'it', fingerprint: first.fingerprint, conflicts: allRename(first.diff), missing: {}, skip: [] });
	const { diff, fingerprint } = await previewTemplateChange(companyId, 'it');
	expect(diff.conflicts).toEqual([]);
	expect(diff.additions).toEqual([]);
	expect(diff.missing.map((m) => m.code)).toEqual(['1-2105']);
	const s = await applyTemplateChange(companyId, { target: 'it', fingerprint, conflicts: {}, missing: {}, skip: [] });
	expect(s).toEqual({ renamed: 0, created: 0, deactivated: 0, reactivated: 0, rulesAdded: 0 });
});
