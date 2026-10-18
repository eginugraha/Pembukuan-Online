import type { LedgerView } from '../reports/ledger';

/** Meratakan buku besar satu akun menjadi baris ekspor: saldo awal, satu baris per transaksi, lalu total. */
export function buildLedgerRows(ledger: LedgerView): { headers: string[]; rows: (string | number)[][] } {
	const headers = ['Tanggal', 'No. Ref', 'Keterangan', 'Debit', 'Kredit', 'Saldo'];
	const rows: (string | number)[][] = [['', '', 'Saldo Awal', '', '', Number(ledger.openingBalance)]];
	for (const line of ledger.lines) {
		rows.push([line.entryDate, line.refNo ?? '', line.description ?? '', Number(line.debit), Number(line.credit), Number(line.balance)]);
	}
	rows.push(['', '', 'Total', Number(ledger.totalDebit), Number(ledger.totalCredit), Number(ledger.closingBalance)]);
	return { headers, rows };
}
