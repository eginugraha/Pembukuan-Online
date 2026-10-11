import { expect, test } from 'bun:test';
import { directionOf, normalizeKeyword, pickRule, type RuleLike } from '../../src/lib/server/categorize/rules';

const rule = (p: Partial<RuleLike> & { keywordPattern: string }): RuleLike => ({
	id: p.keywordPattern,
	accountId: `acc-${p.keywordPattern}`,
	priority: 0,
	source: 'SYSTEM',
	direction: null,
	...p
});

test('USER beats SYSTEM, then priority, then longer keyword', () => {
	const rules = [
		rule({ keywordPattern: 'PLN' }),
		rule({ keywordPattern: 'PLN PASCABAYAR' }),
		rule({ keywordPattern: 'BYR', source: 'USER', priority: 100 })
	];
	expect(pickRule(rules, 'BYR VIA E-BANKING PLN PASCABAYAR', 'DB')?.keywordPattern).toBe('BYR');
	expect(pickRule(rules.slice(0, 2), 'BYR VIA E-BANKING PLN PASCABAYAR', 'DB')?.keywordPattern).toBe('PLN PASCABAYAR');
	const prio = [rule({ keywordPattern: 'PLN PASCABAYAR' }), rule({ keywordPattern: 'PLN', priority: 5 })];
	expect(pickRule(prio, 'PLN PASCABAYAR', 'DB')?.keywordPattern).toBe('PLN');
});

test('direction filters rules; null direction matches both', () => {
	const rules = [rule({ keywordPattern: 'SHOPEE', direction: 'CR' })];
	expect(pickRule(rules, 'TRSF SHOPEE PAY', 'CR')).not.toBeNull();
	expect(pickRule(rules, 'TRSF SHOPEE PAY', 'DB')).toBeNull();
	expect(pickRule([rule({ keywordPattern: 'SHOPEE' })], 'SHOPEE', 'DB')).not.toBeNull();
});

test('keyword matched literally, case-insensitive, wildcards not special', () => {
	expect(pickRule([rule({ keywordPattern: 'DISKON 50%' })], 'DISKON 500 RIBU', 'DB')).toBeNull();
	expect(pickRule([rule({ keywordPattern: 'DISKON 50%' })], 'promo diskon 50% juli', 'DB')).not.toBeNull();
	expect(pickRule([rule({ keywordPattern: 'A_B' })], 'AXB', 'DB')).toBeNull();
});

test('normalizeKeyword and directionOf', () => {
	expect(normalizeKeyword('  payroll   bulanan ')).toBe('PAYROLL BULANAN');
	expect(normalizeKeyword('ab')).toBeNull();
	expect(normalizeKeyword(null)).toBeNull();
	expect(directionOf({ debit: '30000.00' })).toBe('DB');
	expect(directionOf({ debit: '0.00' })).toBe('CR');
});
