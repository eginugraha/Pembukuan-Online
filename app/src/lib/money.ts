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

/** Format laporan keuangan: angka negatif dalam kurung. */
export function formatAccounting(v: MoneyValue): string {
	const s = formatIdr(v);
	return s.startsWith('-') ? `(${s.slice(1)})` : s;
}

/** Ringkas untuk kartu statistik: "Rp 30 rb", "Rp 2,5 jt", "Rp 1,25 M" (maks. 2 desimal, tanpa nol di belakang). */
export function formatIdrShort(v: MoneyValue): string {
	const n = new Decimal(v);
	const abs = n.abs();
	const units: Array<[number, string]> = [
		[1e9, ' M'],
		[1e6, ' jt'],
		[1e3, ' rb']
	];
	const [div, suffix] = units.find(([d]) => abs.gte(d)) ?? [1, ''];
	const scaled = abs.div(div).toDecimalPlaces(div === 1 ? 0 : 2, Decimal.ROUND_HALF_UP);
	return `${n.isNeg() ? '−' : ''}Rp ${scaled.toString().replace('.', ',')}${suffix}`;
}
