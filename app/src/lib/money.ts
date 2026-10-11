import Decimal from 'decimal.js';

export type MoneyValue = Decimal.Value;

export function D(v: MoneyValue): Decimal {
	return new Decimal(v);
}

export function sumMoney(values: MoneyValue[]): Decimal {
	return values.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0));
}

export function toMoney(v: MoneyValue): string {
	return new Decimal(v).toFixed(2, Decimal.ROUND_HALF_UP);
}

export function isZero(v: MoneyValue): boolean {
	return new Decimal(v).isZero();
}

export function formatIdr(v: MoneyValue | null | undefined): string {
	if (v === null || v === undefined || v === '') return '';
	const fixed = new Decimal(v).toFixed(2, Decimal.ROUND_HALF_UP);
	const negative = fixed.startsWith('-');
	const [int, frac] = (negative ? fixed.slice(1) : fixed).split('.');
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return `${negative ? '-' : ''}${grouped},${frac}`;
}
