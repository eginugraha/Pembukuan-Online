import type { JournalEntryView } from '../journal/queries';

const TYPE_LABELS: Record<JournalEntryView['type'], string> = {
	OPENING: 'Saldo Awal',
	TRANSACTION: 'Transaksi',
	CLOSING: 'Penutup'
};

/** Meratakan entri jurnal menjadi baris ekspor: satu baris per baris jurnal. */
export function buildJournalRows(entries: JournalEntryView[]): { headers: string[]; rows: (string | number)[][] } {
	const headers = ['Tanggal', 'No. Ref', 'Keterangan Entry', 'Tipe', 'Kode Akun', 'Nama Akun', 'Debit', 'Kredit'];
	const rows: (string | number)[][] = [];
	for (const entry of entries) {
		const type = TYPE_LABELS[entry.type];
		for (const line of entry.lines) {
			rows.push([
				entry.entryDate,
				entry.refNo ?? '',
				entry.description ?? '',
				type,
				line.accountCode,
				line.accountName,
				Number(line.debit),
				Number(line.credit)
			]);
		}
	}
	return { headers, rows };
}
