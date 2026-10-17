import { expect, test } from 'bun:test';
import { accountOptions } from '$lib/account-options';

test('maps accounts to grouped dropdown options in account-type order', () => {
	const opts = accountOptions([
		{ id: 'e', code: '5-2010', name: 'Beban Administrasi Bank', type: 'EXPENSE' },
		{ id: 'a', code: '1-1001', name: 'Kas', type: 'ASSET' },
		{ id: 'r', code: '4-1001', name: 'Pendapatan Jasa', type: 'REVENUE' }
	]);
	expect(opts).toEqual([
		{ value: 'a', label: 'Kas', code: '1-1001', group: 'Aset' },
		{ value: 'r', label: 'Pendapatan Jasa', code: '4-1001', group: 'Pendapatan' },
		{ value: 'e', label: 'Beban Administrasi Bank', code: '5-2010', group: 'Beban' }
	]);
});

test('without type, options are ungrouped and keep code order', () => {
	expect(accountOptions([{ id: 'x', code: '1-1000', name: 'Aset Lancar' }])).toEqual([{ value: 'x', label: 'Aset Lancar', code: '1-1000', group: undefined }]);
});
