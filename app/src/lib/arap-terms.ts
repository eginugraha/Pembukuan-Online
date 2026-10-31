import { D, sumMoney, toMoney } from './money';

export type ArApStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

/**
 * Hitung nominal tiap termin. Termin berpersen = total x persen / 100 (2 desimal); termin bernominal dipakai apa adanya.
 * Bila semua termin berpersen dan berjumlah tepat 100%, termin terakhir menyerap sisa pembulatan.
 * Selain itu jumlah nominal harus sama persis dengan total.
 */
export function resolveTermAmounts(
	total: string,
	terms: { percent?: string; amount?: string }[]
): { amount: string; percent: string }[] {
	const totalD = D(total);
	const hasValue = (v?: string) => v !== undefined && v !== '';
	if (terms.some((t) => !hasValue(t.percent) && !hasValue(t.amount))) {
		throw new Error('Setiap termin harus punya persentase atau nominal');
	}
	const allPercent = terms.every((t) => hasValue(t.percent));
	if (allPercent && sumMoney(terms.map((t) => t.percent!)).eq(100)) {
		let used = D(0);
		return terms.map((t, i) => {
			const amount = i === terms.length - 1 ? totalD.minus(used) : D(toMoney(totalD.times(t.percent!).div(100)));
			used = used.plus(amount);
			return { amount: toMoney(amount), percent: toMoney(t.percent!) };
		});
	}
	const amounts = terms.map((t) => (hasValue(t.percent) ? D(toMoney(totalD.times(t.percent!).div(100))) : D(t.amount!)));
	if (!sumMoney(amounts).eq(totalD)) {
		throw new Error('Jumlah termin harus sama dengan total');
	}
	return terms.map((t, i) => ({
		amount: toMoney(amounts[i]),
		percent: hasValue(t.percent) ? toMoney(t.percent!) : toMoney(amounts[i].div(totalD).times(100))
	}));
}

export function computeStatus(terms: { paid: boolean }[]): ArApStatus {
	const paid = terms.filter((t) => t.paid).length;
	if (paid === 0) return 'UNPAID';
	return paid === terms.length ? 'PAID' : 'PARTIAL';
}

export function sumUnpaid(terms: { paid: boolean; amount: string }[]): string {
	return toMoney(sumMoney(terms.filter((t) => !t.paid).map((t) => t.amount)));
}

export interface TermSnapshot {
	id: string;
	paid: boolean;
	/** Dokumen efektif: `null` bila tidak terhubung atau dokumennya sudah dihapus (soft delete). */
	documentId: string | null;
}

/**
 * Snapshot termin seperti saat form ubah dimuat. Dikirim bersama Ubah supaya server bisa menolak (409
 * `stale_entry`) bila termin, status lunas, atau tautan dokumen sudah berubah oleh proses lain.
 */
export function toSnapshot(terms: { id: string; paid: boolean; document: { id: string } | null }[]): TermSnapshot[] {
	return terms.map((t) => ({ id: t.id, paid: t.paid, documentId: t.document?.id ?? null }));
}

const NUMBER_RE = /^\d+(\.\d+)?$/;

/**
 * Pratinjau nominal termin tanpa melempar: nilai kosong/tidak berbentuk angka tidak dihitung (validasi baris
 * yang melaporkannya), sedangkan kesalahan aturan termin dikembalikan sebagai pesan.
 */
export function safeResolve(
	total: string,
	terms: { percent?: string; amount?: string }[]
): { amounts: string[] | null; error: string | null } {
	if (!terms.every((t) => NUMBER_RE.test(t.percent ?? t.amount ?? ''))) return { amounts: null, error: null };
	try {
		return { amounts: resolveTermAmounts(total, terms).map((a) => a.amount), error: null };
	} catch (e) {
		return { amounts: null, error: (e as Error).message };
	}
}

/** Termin tersimpan dibuka ulang sebagai persen bila semua persennya positif dan berjumlah tepat 100. */
export function reopenAsPercent(terms: { percent: string }[]): boolean {
	return terms.length > 0 && terms.every((t) => D(t.percent).gt(0)) && sumMoney(terms.map((t) => t.percent)).eq(100);
}
