import { expect, test } from 'bun:test';
import { buildLedgerRows } from '../../src/lib/server/export/ledger';
import type { LedgerView } from '../../src/lib/server/reports/ledger';

const ledger: LedgerView = {
	account: { id: 'a1', code: '1-1002', name: 'Bank', normalBal: 'DEBIT' },
	openingBalance: '1000000.00',
	lines: [{ entryDate: '2026-08-02', refNo: 'JE-202608-0001', description: 'Biaya admin', debit: '0.00', credit: '30000.00', balance: '970000.00' }],
	totalDebit: '0.00',
	totalCredit: '30000.00',
	closingBalance: '970000.00'
};

test('opening row, one row per line, closing total row — all money columns numeric', () => {
	const { headers, rows } = buildLedgerRows(ledger);
	expect(headers).toEqual(['Tanggal', 'No. Ref', 'Keterangan', 'Debit', 'Kredit', 'Saldo']);
	expect(rows).toEqual([
		['', '', 'Saldo Awal', '', '', 1000000],
		['2026-08-02', 'JE-202608-0001', 'Biaya admin', 0, 30000, 970000],
		['', '', 'Total', 0, 30000, 970000]
	]);
});
