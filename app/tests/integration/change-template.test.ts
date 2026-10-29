import { beforeEach, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
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

test('rule for a kept conflict lands on the newly created code', async () => {
	const { companyId } = await makeCompany();
	const before = new Set((await rulesOf(companyId)).map((r) => `${r.keywordPattern.toLowerCase()}|${r.direction}`));
	const { diff, fingerprint } = await previewTemplateChange(companyId, 'it');
	const newCode = diff.conflicts.find((c) => c.code === '5-1003')!.newCodeIfKept!;
	expect(newCode).toBeTruthy();
	const conflicts = { ...allRename(diff), '5-1003': { action: 'keep' as const, reactivate: false } };
	await applyTemplateChange(companyId, { target: 'it', fingerprint, conflicts, missing: {}, skip: [] });
	const newId = await accountIdByCode(companyId, newCode);
	const fresh = COA_TEMPLATE_DATA.it.rules.filter((r) => r.account === '5-1003' && !before.has(`${r.keyword.toLowerCase()}|${r.direction}`));
	expect(fresh.length).toBeGreaterThan(0);
	const after = await rulesOf(companyId);
	for (const r of fresh) expect(after.find((x) => x.keywordPattern === r.keyword)!.accountId).toBe(newId);
});

test('rule whose account is a skipped addition is not inserted', async () => {
	const { companyId } = await makeCompany();
	const { diff, fingerprint } = await previewTemplateChange(companyId, 'it');
	await applyTemplateChange(companyId, { target: 'it', fingerprint, conflicts: allRename(diff), missing: {}, skip: ['5-2014'] });
	const after = await rulesOf(companyId);
	expect(after.some((r) => r.keywordPattern === 'GITHUB')).toBe(false);
	expect(after.some((r) => r.keywordPattern === 'FIGMA')).toBe(false);
	expect(after.some((r) => r.keywordPattern === 'ALFAMART')).toBe(true);
});

test('preview pendingRules: template rules the company lacks (case-insensitive keyword + direction)', async () => {
	const { companyId } = await makeCompany();
	const have = new Set((await rulesOf(companyId)).map((r) => `${r.keywordPattern.toLowerCase()}|${r.direction}`));
	const { pendingRules } = await previewTemplateChange(companyId, 'it');
	expect(pendingRules.length).toBeGreaterThan(0);
	for (const r of pendingRules) expect(have.has(`${r.keyword.toLowerCase()}|${r.direction}`)).toBe(false);
});

test('concurrent manual account create on a kept code → 409, not 500', async () => {
	const { companyId } = await makeCompany();
	const { diff, fingerprint } = await previewTemplateChange(companyId, 'it');
	const newCode = diff.conflicts.find((c) => c.code === '1-2101')!.newCodeIfKept!;
	const conflicts = { ...allRename(diff), '1-2101': { action: 'keep' as const, reactivate: false } };
	// Insert akun (belum commit) memegang FOR KEY SHARE di baris companies, jadi apply tertahan di
	// `for update`, lalu melihat akun baru → fingerprint berbeda → 409.
	let result!: Promise<unknown>;
	await db.transaction(async (tx) => {
		await tx.insert(accounts).values({ companyId, code: newCode, name: 'Manual', type: 'ASSET', normalBal: 'DEBIT' });
		result = applyTemplateChange(companyId, { target: 'it', fingerprint, conflicts, missing: {}, skip: [] }).then(
			() => null,
			(e) => e
		);
		for (let i = 0; i < 100; i++) {
			const [w] = await db.execute<{ n: number }>(sql`select count(*)::int as n from pg_locks where not granted`);
			if (Number(w.n) > 0) return;
			await new Promise((r) => setTimeout(r, 20));
		}
		throw new Error('apply tidak tertahan di kunci');
	});
	expect(await result).toMatchObject({ status: 409, code: 'coa_changed' });
});

/** Trigger sementara: insert akun dengan kode `code` gagal dengan SQLSTATE `errcode` (simulasi gagal di tengah apply). */
async function withFailingInsert(code: string, errcode: string, fn: () => Promise<void>) {
	await db.execute(sql.raw(`
		create or replace function test_fail_account_insert() returns trigger language plpgsql as $$
		begin
			if new.code = '${code}' then raise exception 'gagal disimulasikan' using errcode = '${errcode}'; end if;
			return new;
		end $$;
		create trigger test_fail_account_insert before insert on accounts
			for each row execute function test_fail_account_insert();
	`));
	try {
		await fn();
	} finally {
		await db.execute(sql.raw('drop trigger if exists test_fail_account_insert on accounts; drop function if exists test_fail_account_insert();'));
	}
}

for (const [label, errcode, expected] of [
	['unique violation maps to 409', '23505', { status: 409, code: 'coa_changed' }],
	['other DB error propagates', 'P0001', { cause: { code: 'P0001' } }]
] as const) {
	test(`mid-write failure rolls everything back (${label})`, async () => {
		const { companyId } = await makeCompany();
		const { diff, fingerprint } = await previewTemplateChange(companyId, 'it');
		const rulesBefore = (await rulesOf(companyId)).length;
		// 1-3100 dibuat setelah rename, reaktivasi, dan akun baru berkode lebih kecil
		await withFailingInsert('1-3100', errcode, async () => {
			await expect(
				applyTemplateChange(companyId, { target: 'it', fingerprint, conflicts: allRename(diff), missing: {}, skip: [] })
			).rejects.toMatchObject(expected);
		});
		expect((await loadSnapshot(db, companyId)).fingerprint).toBe(fingerprint);
		expect((await rulesOf(companyId)).length).toBe(rulesBefore);
	});
}
