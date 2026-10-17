/** Perhitungan geometri murni untuk chart SVG. */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Batas atas sumbu (dibulatkan ke 1/2/5 x 10^n) dari nilai absolut terbesar; minimal 1. */
export function niceMax(values: number[]): number {
	const m = Math.max(0, ...values.map((v) => Math.abs(v)));
	if (m <= 0) return 1;
	const exp = Math.floor(Math.log10(m));
	const base = 10 ** exp;
	const f = m / base;
	const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
	return Math.max(1, step * base);
}

/** Magnitudo negatif terbesar di semua seri (0 bila tak ada nilai negatif). */
export function negExtent(...series: number[][]): number {
	return Math.max(0, ...series.flat().map((v) => (v < 0 ? -v : 0)));
}

/**
 * Batang per nilai dalam area setinggi `height`. `max` batas atas positif; ruang ke bawah
 * disediakan sebesar nilai negatif terbesar (atau `negMax` bila diberikan agar beberapa seri sejajar).
 */
export function barGeometry(
	values: number[],
	height: number,
	max: number,
	negMax: number = Math.max(0, ...values.map((v) => (v < 0 ? -v : 0)))
): { y: number; h: number }[] {
	const top = Math.max(max, 1);
	const scale = height / (top + negMax);
	const zero = top * scale;
	return values.map((v) => {
		const h = Math.abs(v) * scale;
		return v >= 0 ? { y: r2(zero - h), h: r2(h) } : { y: r2(zero), h: r2(h) };
	});
}

const pt = (cx: number, cy: number, r: number, a: number) => `${r2(cx + r * Math.sin(a))} ${r2(cy - r * Math.cos(a))}`;

/** Path SVG per irisan donat berpusat di (0,0). Satu irisan 100% menjadi cincin penuh. */
export function donutArcs(values: number[], r: number, inner: number): string[] {
	const total = values.reduce((a, b) => a + b, 0);
	if (values.length === 0 || total <= 0) return [];
	let start = 0;
	return values.map((v) => {
		const sweep = (v / total) * Math.PI * 2;
		const a0 = start;
		start += sweep;
		if (sweep >= Math.PI * 2 - 1e-9) {
			return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z M 0 ${-inner} A ${inner} ${inner} 0 1 0 0 ${inner} A ${inner} ${inner} 0 1 0 0 ${-inner} Z`;
		}
		const a1 = a0 + sweep;
		const large = sweep > Math.PI ? 1 : 0;
		return `M ${pt(0, 0, r, a0)} A ${r} ${r} 0 ${large} 1 ${pt(0, 0, r, a1)} L ${pt(0, 0, inner, a1)} A ${inner} ${inner} 0 ${large} 0 ${pt(0, 0, inner, a0)} Z`;
	});
}

/** Titik-titik garis (x merata, y diskalakan min..max) sebagai array. */
export function linePoints(values: number[], width: number, height: number): { x: number; y: number }[] {
	if (values.length === 0) return [];
	const lo = Math.min(...values);
	const hi = Math.max(...values);
	const span = hi - lo;
	return values.map((v, i) => ({
		x: r2(values.length === 1 ? width / 2 : (i / (values.length - 1)) * width),
		y: r2(span === 0 ? height / 2 : height - ((v - lo) / span) * height)
	}));
}

export function linePath(values: number[], width: number, height: number): string {
	return linePoints(values, width, height)
		.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
		.join(' ');
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const MONTH_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const monthParts = (month: string) => ({ y: Number(month.slice(0, 4)), m: Number(month.slice(5, 7)) - 1 });

/** 'Feb' atau, bila withYear, 'Feb 27'. */
export function monthLabel(month: string, withYear = false): string {
	const { y, m } = monthParts(month);
	return withYear ? `${MONTH_SHORT[m]} ${String(y).slice(2)}` : MONTH_SHORT[m];
}

/** 'Februari 2027'. */
export function monthFull(month: string): string {
	const { y, m } = monthParts(month);
	return `${MONTH_FULL[m]} ${y}`;
}

/** Link laporan laba rugi untuk satu bulan 'YYYY-MM'. */
export function monthHref(month: string): string {
	const { y, m } = monthParts(month);
	const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
	const mm = String(m + 1).padStart(2, '0');
	return `/income-statement?from=${y}-${mm}-01&to=${y}-${mm}-${String(last).padStart(2, '0')}`;
}
