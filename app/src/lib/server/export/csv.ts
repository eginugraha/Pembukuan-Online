const BOM = '﻿';

function formatCell(cell: string | number): string {
	if (typeof cell === 'number') return String(cell);
	if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
	return cell;
}

/** Menulis CSV RFC4180 dengan BOM UTF-8, pemisah koma, dan baris CRLF. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
	const lines = [headers, ...rows].map((line) => line.map(formatCell).join(','));
	return BOM + lines.join('\r\n') + '\r\n';
}
