import { describe, expect, test } from 'bun:test';
import { terbilang } from '$lib/terbilang';

describe('terbilang', () => {
	test('bilangan bulat', () => {
		expect(terbilang('10000000.00')).toBe('Sepuluh Juta Rupiah');
		expect(terbilang('0')).toBe('Nol Rupiah');
		expect(terbilang('11')).toBe('Sebelas Rupiah');
		expect(terbilang('100')).toBe('Seratus Rupiah');
		expect(terbilang('1000')).toBe('Seribu Rupiah');
		expect(terbilang('1500000')).toBe('Satu Juta Lima Ratus Ribu Rupiah');
		expect(terbilang('2000000000')).toBe('Dua Miliar Rupiah');
		expect(terbilang('3000000000000')).toBe('Tiga Triliun Rupiah');
	});
	test('dengan sen', () => {
		expect(terbilang('125.50')).toBe('Seratus Dua Puluh Lima Rupiah Lima Puluh Sen');
	});
});
