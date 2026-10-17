export interface BarSpec {
	/** Tinggi batang (6–100), berdasarkan besaran nilai. */
	percent: number;
	/** Nilai negatif (mis. bulan rugi) diwarnai berbeda; tinggi tetap mengikuti besaran. */
	negative: boolean;
}

/** Batang mini 6 bulan: diskalakan menurut nilai absolut terbesar, tanda nilai dipertahankan. */
export function barSpecs(values: string[]): BarSpec[] {
	const max = Math.max(...values.map((v) => Math.abs(Number(v))), 1);
	return values.map((v) => {
		const n = Number(v);
		return { percent: n === 0 ? 6 : Math.max(14, Math.round((Math.abs(n) / max) * 100)), negative: n < 0 };
	});
}
