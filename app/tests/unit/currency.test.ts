import { expect, test } from 'bun:test';
import { formatAmount, formatUsd } from '../../src/lib/currency';
import { terbilang } from '../../src/lib/terbilang';

test('formatUsd uses US separators and always two decimals', () => {
	expect(formatUsd('1250')).toBe('$1,250.00');
	expect(formatUsd('1234567.5')).toBe('$1,234,567.50');
	expect(formatUsd('-100')).toBe('-$100.00');
});

test('formatAmount keeps the ledger style for IDR and switches for USD', () => {
	expect(formatAmount('1500000', 'IDR')).toBe('1.500.000,00');
	expect(formatAmount('1500', 'USD')).toBe('$1,500.00');
	expect(formatAmount(null, 'USD')).toBe('');
});

test('terbilang names the currency', () => {
	expect(terbilang('1250', 'USD')).toBe('Seribu Dua Ratus Lima Puluh Dolar Amerika Serikat');
	expect(terbilang('10.50', 'USD')).toBe('Sepuluh Dolar Amerika Serikat Lima Puluh Sen');
	expect(terbilang('1000')).toBe('Seribu Rupiah');
});
