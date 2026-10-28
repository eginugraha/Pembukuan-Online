/** Status penawaran dihitung saat dibaca, tidak disimpan (lihat spesifikasi penawaran). */
export type QuotationStatus = 'pending' | 'approved' | 'expired' | 'revised';

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
	pending: 'Menunggu',
	approved: 'Disetujui',
	expired: 'Kedaluwarsa',
	revised: 'Direvisi'
};

/** Versi lama selalu Direvisi; versi terbaru: Disetujui, lalu Kedaluwarsa (bila tanggal lewat), selain itu Menunggu. */
export function quotationStatus(
	q: { approvedAt: Date | string | null; validUntil: string | null; isLatest: boolean },
	today: string
): QuotationStatus {
	if (!q.isLatest) return 'revised';
	if (q.approvedAt) return 'approved';
	if (q.validUntil && today > q.validUntil) return 'expired';
	return 'pending';
}

/** Nomor tampil: nomor dasar, ditambah `-R<n>` untuk revisi ke-n. */
export function quotationNo(baseNo: string, revision: number): string {
	return revision === 0 ? baseNo : `${baseNo}-R${revision}`;
}
