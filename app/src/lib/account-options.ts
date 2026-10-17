import type { SearchOption } from '$lib/components/SearchSelect.svelte';

const TYPE_LABEL = { ASSET: 'Aset', LIABILITY: 'Liabilitas', EQUITY: 'Ekuitas', REVENUE: 'Pendapatan', EXPENSE: 'Beban' } as const;
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
