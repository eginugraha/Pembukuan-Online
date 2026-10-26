const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Bulan 1-12 menjadi angka Romawi. */
export function toRoman(month: number): string {
	const r = ROMAWI[month - 1];
	if (!r) throw new Error(`Bulan tidak valid: ${month}`);
	return r;
}

/** Nomor dokumen, mis. `001/SET-XFORMATION/INV/IV/2026`. `issueDate` berformat ISO YYYY-MM-DD. */
export function formatDocumentNumber(o: {
	seq: number;
	companyCode: string;
	contactCode: string;
	kind: 'INV' | 'PO' | 'RCP';
	issueDate: string;
}): string {
	const [tahun, bulan] = o.issueDate.split('-');
	const seq = String(o.seq).padStart(3, '0');
	return `${seq}/${o.companyCode}-${o.contactCode}/${o.kind}/${toRoman(Number(bulan))}/${tahun}`;
}
