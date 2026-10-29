import type { SearchOption } from '$lib/components/SearchSelect.svelte';

export const TYPE_LABEL = { ASSET: 'Aset', LIABILITY: 'Liabilitas', EQUITY: 'Ekuitas', REVENUE: 'Pendapatan', EXPENSE: 'Beban' } as const;
const TYPE_ORDER = Object.keys(TYPE_LABEL);

/** Daftar akun → opsi dropdown, dikelompokkan per tipe akun (urutan Aset → Beban), lalu per kode. */
export function accountOptions(list: { id: string; code: string; name: string; type?: string }[]): SearchOption[] {
	return [...list]
		.sort((a, b) => TYPE_ORDER.indexOf(a.type ?? '') - TYPE_ORDER.indexOf(b.type ?? '') || a.code.localeCompare(b.code))
		.map((a) => ({ value: a.id, label: a.name, code: a.code, group: a.type ? TYPE_LABEL[a.type as keyof typeof TYPE_LABEL] : undefined }));
}

/** Teks pencarian untuk sel akun di tabel transaksi: akun terpilih, atau akun saran AI (kode dan nama). */
export function accountSearchText(t: { accountCode: string | null; accountName: string | null; suggestedCode: string | null; suggestedName: string | null }): string {
	if (t.accountCode) return `${t.accountCode} ${t.accountName ?? ''}`.trim();
	return `${t.suggestedCode ?? ''} ${t.suggestedName ?? ''}`.trim();
}

const CASH_FLOW_LABEL = { OPERATING: 'Operasional', INVESTING: 'Investasi', FINANCING: 'Pendanaan' } as const;

interface TreeAccount {
	id: string;
	code: string;
	name: string;
	parentId: string | null;
	cashFlowCat: keyof typeof CASH_FLOW_LABEL | null;
}

/**
 * Perubahan klasifikasi laporan bila data akun `fromId` dipindah ke `toId`: kelompok neraca/laba rugi
 * (induk tingkat-1, mis. Aset Lancar vs Aset Tidak Lancar) dan kategori arus kas. Kosong = klasifikasi sama.
 */
export function classificationChange(accounts: TreeAccount[], fromId: string, toId: string): string[] {
	const byId = new Map(accounts.map((a) => [a.id, a]));
	const groupOf = (id: string): TreeAccount | undefined => {
		let cur = byId.get(id);
		while (cur?.parentId && byId.get(cur.parentId)?.parentId) cur = byId.get(cur.parentId);
		return cur;
	};
	const from = byId.get(fromId);
	const to = byId.get(toId);
	if (!from || !to) return [];
	const out: string[] = [];
	const gFrom = groupOf(fromId);
	const gTo = groupOf(toId);
	if (gFrom && gTo && gFrom.id !== gTo.id) out.push(`kelompok laporan: ${gFrom.name} → ${gTo.name}`);
	if (from.cashFlowCat !== to.cashFlowCat) {
		const label = (c: TreeAccount['cashFlowCat']) => (c ? CASH_FLOW_LABEL[c] : 'belum diatur');
		out.push(`kategori arus kas: ${label(from.cashFlowCat)} → ${label(to.cashFlowCat)}`);
	}
	return out;
}
