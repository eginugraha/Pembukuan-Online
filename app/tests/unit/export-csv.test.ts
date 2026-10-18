import { expect, test } from 'bun:test';
import { toCsv } from '../../src/lib/server/export/csv';

test('writes a UTF-8 BOM, comma delimiter, dot decimals, and CRLF lines', () => {
	const csv = toCsv(['Nama', 'Jumlah'], [['Beban Adm, Bank', 1234.5], ['Café', 0]]);
	expect(csv.charCodeAt(0)).toBe(0xfeff);
	const body = csv.slice(1);
	expect(body.split('\r\n')).toEqual(['Nama,Jumlah', '"Beban Adm, Bank",1234.5', 'Café,0', '']);
});

test('escapes quotes by doubling them', () => {
	const csv = toCsv(['A'], [['She said "hi"']]);
	expect(csv.slice(1)).toBe('A\r\n"She said ""hi"""\r\n');
});
