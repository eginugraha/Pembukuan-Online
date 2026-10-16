import { expect, test } from 'bun:test';
import { BANK_ACCOUNT_CODE, DEFAULT_COA } from '../../src/lib/server/company/coa-data';
import { DEFAULT_RULES } from '../../src/lib/server/company/rules-data';
import { COA_TEMPLATE_DATA } from '../../src/lib/server/company/templates';
import { COA_TEMPLATES } from '../../src/lib/coa-templates';

test('CoA has 76 unique accounts and parents precede children', () => {
	expect(DEFAULT_COA).toHaveLength(76);
	expect(DEFAULT_RULES).toHaveLength(19);
});

test('every template id has server data and vice versa', () => {
	expect(Object.keys(COA_TEMPLATE_DATA).sort()).toEqual(COA_TEMPLATES.map((t) => t.id).sort());
});

for (const [id, { coa, rules }] of Object.entries(COA_TEMPLATE_DATA)) {
	test(`[${id}] accounts are unique, parents precede children and share the parent's type`, () => {
		const byCode = new Map<string, (typeof coa)[number]>();
		for (const a of coa) {
			expect(byCode.has(a.code)).toBe(false);
			if (a.parent) {
				expect(byCode.has(a.parent)).toBe(true);
				expect(byCode.get(a.parent)!.type).toBe(a.type);
			}
			byCode.set(a.code, a);
		}
		const bank = byCode.get(BANK_ACCOUNT_CODE);
		expect(bank?.type).toBe('ASSET');
		expect(coa.some((a) => a.parent === BANK_ACCOUNT_CODE)).toBe(false);
	});

	test(`[${id}] every rule points to a leaf account, has a direction and a unique keyword`, () => {
		const parents = new Set(coa.map((a) => a.parent).filter(Boolean));
		const codes = new Set(coa.map((a) => a.code));
		const keys = new Set<string>();
		for (const r of rules) {
			expect(codes.has(r.account)).toBe(true);
			expect(parents.has(r.account)).toBe(false);
			expect(['DB', 'CR']).toContain(r.direction);
			expect(r.keyword).toBe(r.keyword.trim().toUpperCase());
			expect(r.keyword.length).toBeGreaterThanOrEqual(3);
			expect(keys.has(`${r.keyword}|${r.direction}`)).toBe(false);
			keys.add(`${r.keyword}|${r.direction}`);
		}
		expect(rules.some((r) => r.keyword === 'BI-FAST')).toBe(false);
	});
}

test('IT template has the accounts an IT company needs', () => {
	const names = COA_TEMPLATE_DATA.it.coa.map((a) => a.name);
	for (const n of [
		'Pendapatan Belum Ditagih',
		'PPh 23 Dibayar Dimuka',
		'Komputer & Laptop',
		'Perangkat Lunak & Lisensi',
		'Biaya Pengembangan Software',
		'Akumulasi Amortisasi',
		'Pendapatan Langganan (SaaS)',
		'Beban Pokok Pendapatan',
		'Cloud, Hosting & Server'
	]) {
		expect(names.some((x) => x.startsWith(n))).toBe(true);
	}
	expect(names.some((x) => /pabrik|bahan baku/i.test(x))).toBe(false);
});
