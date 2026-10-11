import { expect, test } from 'bun:test';
import { BANK_ACCOUNT_CODE, DEFAULT_COA } from '../../src/lib/server/company/coa-data';
import { DEFAULT_RULES } from '../../src/lib/server/company/rules-data';

test('CoA has 76 unique accounts and parents precede children', () => {
	expect(DEFAULT_COA).toHaveLength(76);
	const seen = new Set<string>();
	for (const a of DEFAULT_COA) {
		expect(seen.has(a.code)).toBe(false);
		if (a.parent) expect(seen.has(a.parent)).toBe(true);
		seen.add(a.code);
	}
	expect(seen.has(BANK_ACCOUNT_CODE)).toBe(true);
});

test('every rule points to a leaf account and has a direction', () => {
	const parents = new Set(DEFAULT_COA.map((a) => a.parent).filter(Boolean));
	const codes = new Set(DEFAULT_COA.map((a) => a.code));
	expect(DEFAULT_RULES).toHaveLength(19);
	for (const r of DEFAULT_RULES) {
		expect(codes.has(r.account)).toBe(true);
		expect(parents.has(r.account)).toBe(false);
		expect(['DB', 'CR']).toContain(r.direction);
	}
	expect(DEFAULT_RULES.some((r) => r.keyword === 'BI-FAST')).toBe(false);
});
