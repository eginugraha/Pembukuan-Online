import Decimal from 'decimal.js';
import { formatIdr, type MoneyValue } from './money';

/** Mata uang yang bisa dipilih di invoice. Tidak ada kurs: nilai dicatat apa adanya. */
export const CURRENCIES = ['IDR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Angka dolar gaya AS, selalu 2 desimal: "$1,250.00", negatif "-$100.00". */
export function formatUsd(v: MoneyValue): string {
	const fixed = new Decimal(v).toFixed(2, Decimal.ROUND_HALF_UP);
	const negative = fixed.startsWith('-');
	const [int, frac] = (negative ? fixed.slice(1) : fixed).split('.');
	return `${negative ? '-' : ''}$${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

/** Nominal untuk tampilan aplikasi: IDR tetap gaya buku besar ("1.500.000,00"), USD "$1,250.00". */
export function formatAmount(v: MoneyValue | null | undefined, currency: string): string {
	if (v === null || v === undefined || v === '') return '';
	return currency === 'USD' ? formatUsd(v) : formatIdr(v);
}
