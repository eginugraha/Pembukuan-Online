import { monthRange } from './dates';

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Tanggal awal tahun buku yang memuat `asOf`. `startMonth` = companies.fiscal_year (mis. "JANUARY"). */
export function fiscalYearStart(asOf: string, startMonth: string): string {
	const m = Math.max(0, MONTHS.indexOf(startMonth.toUpperCase())) + 1;
	const [y, mm] = asOf.split('-').map(Number);
	const year = mm >= m ? y : y - 1;
	return `${year}-${String(m).padStart(2, '0')}-01`;
}

export function dayBefore(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return iso(Date.UTC(y, m - 1, d - 1));
}

export function previousFiscalYearEnd(date: string, startMonth: string): string {
	return dayBefore(fiscalYearStart(date, startMonth));
}

/** Geser tahun; tanggal yang melewati akhir bulan dijepit ke hari terakhir bulan. */
export function shiftYears(date: string, years: number): string {
	const [y, m, d] = date.split('-').map(Number);
	const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
	// Akhir bulan tetap akhir bulan (28 Feb 2029 -> 29 Feb 2028).
	if (d === new Date(Date.UTC(y, m, 0)).getUTCDate()) return iso(Date.UTC(y + years, m - 1, last));
	return iso(Date.UTC(y + years, m - 1, Math.min(d, last)));
}

export function defaultReportRange(today: string, startMonth: string): { from: string; to: string } {
	return { from: fiscalYearStart(today, startMonth), to: monthRange(today).to };
}

export function defaultBalanceSheetAsOf(today: string, startMonth: string): string {
	if (fiscalYearStart(today, startMonth) === monthRange(today).from) return previousFiscalYearEnd(today, startMonth);
	return monthRange(today).to;
}

export function formatDateLong(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

export function formatPeriod(from: string, to: string): string {
	return `${formatDateLong(from)} – ${formatDateLong(to)}`;
}

export function dayAfter(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return iso(Date.UTC(y, m - 1, d + 1));
}

/** Hari terakhir tahun buku yang dimulai pada `start`. */
export function fiscalYearEnd(start: string): string {
	return dayBefore(shiftYears(start, 1));
}

export function fiscalYearLabel(start: string, end: string): string {
	const a = start.slice(0, 4);
	const b = end.slice(0, 4);
	return a === b ? a : `${a}/${b}`;
}
