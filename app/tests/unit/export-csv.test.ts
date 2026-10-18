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

test('a lone CR in a cell also triggers quoting, not just LF', () => {
	const csv = toCsv(['A'], [['line1\rline2']]);
	expect(csv.slice(1)).toBe('A\r\n"line1\rline2"\r\n');
});

test('neutralizes a formula-injection payload starting with "="', () => {
	const csv = toCsv(['Keterangan'], [['=HYPERLINK("http://evil","click")']]);
	const body = csv.slice(1);
	// The cell must not appear with a bare leading "=" anywhere a spreadsheet would read it as a formula.
	expect(body).not.toMatch(/(^|,|")=HYPERLINK/);
	expect(body).toContain("'=HYPERLINK");
});

test('neutralizes a cell starting with "-" (would otherwise risk #NAME? in Excel)', () => {
	const csv = toCsv(['Keterangan'], [['-Biaya admin lebih awal']]);
	const body = csv.slice(1);
	expect(body).not.toMatch(/(^|,|")-Biaya admin/);
	expect(body).toContain("'-Biaya admin lebih awal");
});

test('neutralizes a cell starting with "+"', () => {
	const csv = toCsv(['Keterangan'], [['+1234567']]);
	const body = csv.slice(1);
	expect(body).not.toMatch(/(^|,|")\+1234567/);
	expect(body).toContain("'+1234567");
});

test('neutralizes a cell starting with "@"', () => {
	const csv = toCsv(['Keterangan'], [['@SUM(1,2)']]);
	const body = csv.slice(1);
	expect(body).not.toMatch(/(^|,|")@SUM/);
	expect(body).toContain("'@SUM(1,2)");
});

test('normal cells not starting with =/+/-/@ are completely unaffected', () => {
	const csv = toCsv(['Keterangan'], [['Biaya admin bulanan']]);
	expect(csv.slice(1)).toBe('Keterangan\r\nBiaya admin bulanan\r\n');
});
