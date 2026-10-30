import { expect, test } from 'bun:test';
import { computeStatus, resolveTermAmounts, sumUnpaid } from '$lib/arap-terms';
import { sumMoney } from '$lib/money';

test('splits by percent', () => {
	const r = resolveTermAmounts('100000000', [{ percent: '30' }, { percent: '40' }, { percent: '30' }]);
	expect(r.map((t) => t.amount)).toEqual(['30000000.00', '40000000.00', '30000000.00']);
	expect(r.map((t) => t.percent)).toEqual(['30.00', '40.00', '30.00']);
});

test('percents summing to 100 always add up to the total', () => {
	const r = resolveTermAmounts('100', [{ percent: '33.33' }, { percent: '33.33' }, { percent: '33.34' }]);
	expect(sumMoney(r.map((t) => t.amount)).toFixed(2)).toBe('100.00');
});

test('last term absorbs the rounding remainder', () => {
	const r = resolveTermAmounts('10', [{ percent: '33.33' }, { percent: '33.33' }, { percent: '33.34' }]);
	expect(r.map((t) => t.amount)).toEqual(['3.33', '3.33', '3.34']);
});

test('percents not summing to 100 throw', () => {
	expect(() => resolveTermAmounts('100', [{ percent: '33.33' }, { percent: '33.33' }, { percent: '33.33' }])).toThrow();
});

test('amount terms must sum to total and get a computed percent', () => {
	const r = resolveTermAmounts('200', [{ amount: '50' }, { amount: '150' }]);
	expect(r).toEqual([
		{ amount: '50.00', percent: '25.00' },
		{ amount: '150.00', percent: '75.00' }
	]);
	expect(() => resolveTermAmounts('200', [{ amount: '50' }, { amount: '100' }])).toThrow();
});

test('mixed percent and amount must sum to total', () => {
	expect(resolveTermAmounts('100', [{ percent: '40' }, { amount: '60' }]).map((t) => t.amount)).toEqual(['40.00', '60.00']);
	expect(() => resolveTermAmounts('100', [{ percent: '40' }, { amount: '50' }])).toThrow();
});

test('computeStatus', () => {
	expect(computeStatus([{ paid: true }, { paid: false }])).toBe('PARTIAL');
	expect(computeStatus([{ paid: true }, { paid: true }])).toBe('PAID');
	expect(computeStatus([{ paid: false }, { paid: false }])).toBe('UNPAID');
	expect(computeStatus([{ paid: false }])).toBe('UNPAID');
});

test('sumUnpaid sums only unpaid terms', () => {
	expect(sumUnpaid([{ paid: true, amount: '30.00' }, { paid: false, amount: '20.50' }, { paid: false, amount: '10' }])).toBe('30.50');
	expect(sumUnpaid([{ paid: true, amount: '30.00' }])).toBe('0.00');
});
