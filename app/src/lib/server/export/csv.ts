const BOM = '﻿';

// Karakter yang membuat Excel/Sheets membaca sel sebagai rumus (CSV/formula injection, OWASP)
// jika ada di awal sel: "=", "+", "-", "@", atau tab/CR yang menipu parser baris.
const FORMULA_LEADING_CHARS = /^[=+\-@\t\r]/;

function formatCell(cell: string | number): string {
	if (typeof cell === 'number') return String(cell);
	// Sel string yang bisa ditafsirkan sebagai rumus diberi prefix tanda kutip tunggal (`'`) —
	// konvensi standar Excel/Sheets untuk "paksa sebagai teks" — sebelum quoting CSV biasa.
	// Sumber sel ini bisa deskripsi bebas dari rekening koran (dikendalikan pihak lain), jadi
	// harus dianggap tidak tepercaya.
	const safe = FORMULA_LEADING_CHARS.test(cell) ? `'${cell}` : cell;
	if (/["\r\n,]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
	return safe;
}

/** Menulis CSV RFC4180 dengan BOM UTF-8, pemisah koma, dan baris CRLF. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
	const lines = [headers, ...rows].map((line) => line.map(formatCell).join(','));
	return BOM + lines.join('\r\n') + '\r\n';
}
