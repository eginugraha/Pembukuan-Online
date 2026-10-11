import { expect, test } from 'bun:test';
import { assertBalanced, buildTransactionLines } from '../../src/lib/server/journal/lines';

test('money out: debit category, credit bank', () => {
	expect(buildTransactionLines({ debit: '30000', credit: '0', accountId: 'beban' }, 'bank')).toEqual([
		{ accountId: 'beban', debit: '30000.00', credit: '0.00' },
		{ accountId: 'bank', debit: '0.00', credit: '30000.00' }
	]);
});

test('money in: debit bank, credit category', () => {
	expect(buildTransactionLines({ debit: '0.00', credit: '2500000.5', accountId: 'pendapatan' }, 'bank')).toEqual([
		{ accountId: 'bank', debit: '2500000.50', credit: '0.00' },
		{ accountId: 'pendapatan', debit: '0.00', credit: '2500000.50' }
	]);
});

test('assertBalanced accepts balanced and rejects invalid journals', () => {
	expect(() =>
		assertBalanced([
			{ accountId: 'a', debit: '100.10', credit: '0' },
			{ accountId: 'b', debit: '0', credit: '50.05' },
			{ accountId: 'c', debit: '0', credit: '50.05' }
		])
	).not.toThrow();
	const err = (fn: () => void) => {
		try {
			fn();
		} catch (e) {
			return (e as { code: string }).code;
		}
		return null;
	};
	expect(err(() => assertBalanced([{ accountId: 'a', debit: '1', credit: '0' }]))).toBe('unbalanced');
	expect(err(() => assertBalanced([{ accountId: 'a', debit: '1', credit: '0' }, { accountId: 'b', debit: '0', credit: '2' }]))).toBe('unbalanced');
	expect(err(() => assertBalanced([{ accountId: 'a', debit: '1', credit: '1' }, { accountId: 'b', debit: '0', credit: '0' }]))).toBe('invalid_line');
	expect(err(() => assertBalanced([{ accountId: 'a', debit: '-1', credit: '0' }, { accountId: 'b', debit: '0', credit: '-1' }]))).toBe('invalid_line');
});
