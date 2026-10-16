import { describe, expect, test } from 'bun:test';
import { D, formatIdr, formatIdrShort, isZero, sumMoney, toMoney } from '$lib/money';

describe('money', () => {
	test('sumMoney adds without float error', () => {
		expect(toMoney(sumMoney(['0.10', '0.20']))).toBe('0.30');
		expect(toMoney(sumMoney([]))).toBe('0.00');
	});
	test('toMoney rounds to 2 decimals', () => {
		expect(toMoney('1234.5')).toBe('1234.50');
		expect(toMoney(D('10').div(3))).toBe('3.33');
	});
	test('formatIdr uses id-ID separators', () => {
		expect(formatIdr('1234567.89')).toBe('1.234.567,89');
		expect(formatIdr('0')).toBe('0,00');
		expect(formatIdr('-30000')).toBe('-30.000,00');
		expect(formatIdr(null)).toBe('');
	});
	test('isZero', () => {
		expect(isZero('0.00')).toBe(true);
		expect(isZero('0.01')).toBe(false);
	});
});

test('formatIdrShort abbreviates to rb / jt / M with Indonesian decimals', () => {
	expect(formatIdrShort('0')).toBe('Rp 0');
	expect(formatIdrShort('850')).toBe('Rp 850');
	expect(formatIdrShort('30000')).toBe('Rp 30 rb');
	expect(formatIdrShort('2500000')).toBe('Rp 2,5 jt');
	expect(formatIdrShort('2020987.65')).toBe('Rp 2,02 jt');
	expect(formatIdrShort('1250000000')).toBe('Rp 1,25 M');
	expect(formatIdrShort('-30000')).toBe('−Rp 30 rb');
});
