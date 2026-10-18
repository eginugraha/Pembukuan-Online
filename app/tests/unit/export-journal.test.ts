import { expect, test } from 'bun:test';
import { buildJournalRows } from '../../src/lib/server/export/journal';
import type { JournalEntryView } from '../../src/lib/server/journal/queries';

const entries: JournalEntryView[] = [
	{
		id: '1', entryDate: '2026-08-02', refNo: 'JE-202608-0001', description: 'Biaya admin', type: 'TRANSACTION',
		lines: [
			{ lineId: 'l1', accountId: 'a1', accountCode: '5-2010', accountName: 'Biaya Admin Bank', debit: '30000.00', credit: '0.00', editable: true },
			{ lineId: 'l2', accountId: 'a2', accountCode: '1-1002', accountName: 'Bank', debit: '0.00', credit: '30000.00', editable: false }
		]
	},
	{
		id: '2', entryDate: '2026-08-01', refNo: null, description: null, type: 'OPENING',
		lines: [{ lineId: 'l3', accountId: 'a2', accountCode: '1-1002', accountName: 'Bank', debit: '1000000.00', credit: '0.00', editable: false }]
	}
];

test('one row per line, with entry fields repeated on every line of the same entry', () => {
	const { headers, rows } = buildJournalRows(entries);
	expect(headers).toEqual(['Tanggal', 'No. Ref', 'Keterangan Entry', 'Tipe', 'Kode Akun', 'Nama Akun', 'Debit', 'Kredit']);
	expect(rows).toEqual([
		['2026-08-02', 'JE-202608-0001', 'Biaya admin', 'Transaksi', '5-2010', 'Biaya Admin Bank', 30000, 0],
		['2026-08-02', 'JE-202608-0001', 'Biaya admin', 'Transaksi', '1-1002', 'Bank', 0, 30000],
		['2026-08-01', '', '', 'Saldo Awal', '1-1002', 'Bank', 1000000, 0]
	]);
	for (const r of rows) {
		expect(typeof r[6]).toBe('number');
		expect(typeof r[7]).toBe('number');
	}
});
