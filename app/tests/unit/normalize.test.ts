import { expect, test } from 'bun:test';
import { normalizeDescription } from '../../src/lib/server/categorize/normalize';

test('drops tokens containing digits and uppercases', () => {
	expect(normalizeDescription('TRSF E-BANKING DB 3108/FTSCY/WS95051 12642000.00 Payroll August 26 BUDI SANTOSO')).toBe(
		'TRSF E-BANKING DB PAYROLL AUGUST BUDI SANTOSO'
	);
	expect(normalizeDescription('BIAYA ADM 0998')).toBe('BIAYA ADM');
	expect(normalizeDescription('BYR VIA E-BANKING 18/08 95051 PENERIMAAN NEGARA 042399044680029')).toBe(
		'BYR VIA E-BANKING PENERIMAAN NEGARA'
	);
});

test('collapses whitespace and handles empty result', () => {
	expect(normalizeDescription('  bunga   ')).toBe('BUNGA');
	expect(normalizeDescription('12345 67/89')).toBe('');
});
