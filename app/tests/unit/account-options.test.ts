import { expect, test } from 'bun:test';
import { accountOptions, classificationChange } from '$lib/account-options';

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

const tree = [
	{ id: 'root', code: '1-0000', name: 'ASET', parentId: null, cashFlowCat: null },
	{ id: 'cur', code: '1-1000', name: 'Aset Lancar', parentId: 'root', cashFlowCat: null },
	{ id: 'fix', code: '1-2000', name: 'Aset Tidak Lancar', parentId: 'root', cashFlowCat: null },
	{ id: 'kas', code: '1-1001', name: 'Kas', parentId: 'cur', cashFlowCat: 'OPERATING' as const },
	{ id: 'piutang', code: '1-1003', name: 'Piutang', parentId: 'cur', cashFlowCat: 'OPERATING' as const },
	{ id: 'tanah', code: '1-2101', name: 'Tanah', parentId: 'fix', cashFlowCat: 'INVESTING' as const },
	{ id: 'bangunan', code: '1-2102', name: 'Bangunan', parentId: 'fix', cashFlowCat: null }
];

test('classificationChange is empty when the report group and cash-flow category match', () => {
	expect(classificationChange(tree, 'kas', 'piutang')).toEqual([]);
});

test('classificationChange names every way a move changes reporting', () => {
	expect(classificationChange(tree, 'kas', 'tanah')).toEqual(['kelompok laporan: Aset Lancar → Aset Tidak Lancar', 'kategori arus kas: Operasional → Investasi']);
	expect(classificationChange(tree, 'tanah', 'bangunan')).toEqual(['kategori arus kas: Investasi → belum diatur']);
});
