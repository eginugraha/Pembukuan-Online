export type AccountTypeSeed = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export interface CoaSeed {
	code: string;
	name: string;
	type: AccountTypeSeed;
	normalBal: 'DEBIT' | 'CREDIT';
	parent?: string;
}

export const BANK_ACCOUNT_CODE = '1-1002';

// Urutan penting: induk selalu muncul sebelum anaknya.
export const DEFAULT_COA: CoaSeed[] = [
	// ── ASET ──
	{ code: '1-0000', name: 'ASET', type: 'ASSET', normalBal: 'DEBIT' },
	{ code: '1-1000', name: 'Aset Lancar', type: 'ASSET', normalBal: 'DEBIT', parent: '1-0000' },
	{ code: '1-1001', name: 'Kas', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1002', name: 'Bank BCA', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1003', name: 'Piutang Usaha', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1004', name: 'Piutang Lain-lain', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1005', name: 'Persediaan', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1006', name: 'Beban Dibayar Dimuka', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1007', name: 'Pajak Dibayar Dimuka', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-2000', name: 'Aset Tidak Lancar', type: 'ASSET', normalBal: 'DEBIT', parent: '1-0000' },
	{ code: '1-2001', name: 'Investasi Jangka Panjang', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2000' },
	{ code: '1-2100', name: 'Aset Tetap', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2000' },
	{ code: '1-2101', name: 'Tanah', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2100' },
	{ code: '1-2102', name: 'Bangunan', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2100' },
	{ code: '1-2103', name: 'Kendaraan', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2100' },
	{ code: '1-2104', name: 'Peralatan & Mesin', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2100' },
	{ code: '1-2105', name: 'Inventaris Kantor', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2100' },
	{ code: '1-2200', name: 'Akumulasi Penyusutan', type: 'ASSET', normalBal: 'CREDIT', parent: '1-2000' },
	{ code: '1-2201', name: 'Akum. Penyusutan Bangunan', type: 'ASSET', normalBal: 'CREDIT', parent: '1-2200' },
	{ code: '1-2202', name: 'Akum. Penyusutan Kendaraan', type: 'ASSET', normalBal: 'CREDIT', parent: '1-2200' },
	{ code: '1-2203', name: 'Akum. Penyusutan Peralatan', type: 'ASSET', normalBal: 'CREDIT', parent: '1-2200' },
	{ code: '1-2204', name: 'Akum. Penyusutan Inventaris', type: 'ASSET', normalBal: 'CREDIT', parent: '1-2200' },
	{ code: '1-3000', name: 'Aset Tak Berwujud', type: 'ASSET', normalBal: 'DEBIT', parent: '1-0000' },
	{ code: '1-3001', name: 'Goodwill', type: 'ASSET', normalBal: 'DEBIT', parent: '1-3000' },
	{ code: '1-3002', name: 'Hak Paten & Lisensi', type: 'ASSET', normalBal: 'DEBIT', parent: '1-3000' },
	// ── LIABILITAS ──
	{ code: '2-0000', name: 'LIABILITAS', type: 'LIABILITY', normalBal: 'CREDIT' },
	{ code: '2-1000', name: 'Liabilitas Jangka Pendek', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-0000' },
	{ code: '2-1001', name: 'Utang Usaha', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1002', name: 'Utang Pajak', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1003', name: 'Utang PPh 21', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1004', name: 'Utang PPh 23', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1005', name: 'Utang PPN', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1006', name: 'Beban Akrual', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1007', name: 'Pendapatan Diterima Dimuka', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1008', name: 'Utang Bank Jangka Pendek', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-2000', name: 'Liabilitas Jangka Panjang', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-0000' },
	{ code: '2-2001', name: 'Utang Bank Jangka Panjang', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-2000' },
	{ code: '2-2002', name: 'Liabilitas Imbalan Kerja', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-2000' },
	{ code: '2-2003', name: 'Utang Obligasi', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-2000' },
	// ── EKUITAS ──
	{ code: '3-0000', name: 'EKUITAS', type: 'EQUITY', normalBal: 'CREDIT' },
	{ code: '3-1001', name: 'Modal Saham Disetor', type: 'EQUITY', normalBal: 'CREDIT', parent: '3-0000' },
	{ code: '3-1002', name: 'Tambahan Modal Disetor (APIC)', type: 'EQUITY', normalBal: 'CREDIT', parent: '3-0000' },
	{ code: '3-1003', name: 'Saldo Laba Ditahan', type: 'EQUITY', normalBal: 'CREDIT', parent: '3-0000' },
	{ code: '3-1004', name: 'Laba Tahun Berjalan', type: 'EQUITY', normalBal: 'CREDIT', parent: '3-0000' },
	{ code: '3-1005', name: 'Dividen', type: 'EQUITY', normalBal: 'DEBIT', parent: '3-0000' },
	// ── PENDAPATAN ──
	{ code: '4-0000', name: 'PENDAPATAN', type: 'REVENUE', normalBal: 'CREDIT' },
	{ code: '4-1000', name: 'Pendapatan Usaha', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-0000' },
	{ code: '4-1001', name: 'Pendapatan Jasa', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-1000' },
	{ code: '4-1002', name: 'Pendapatan Penjualan', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-1000' },
	{ code: '4-1003', name: 'Retur & Potongan Penjualan', type: 'REVENUE', normalBal: 'DEBIT', parent: '4-1000' },
	{ code: '4-2000', name: 'Pendapatan Lain-lain', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-0000' },
	{ code: '4-2001', name: 'Pendapatan Bunga', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-2000' },
	{ code: '4-2002', name: 'Keuntungan Penjualan Aset', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-2000' },
	// ── BEBAN ──
	{ code: '5-0000', name: 'BEBAN', type: 'EXPENSE', normalBal: 'DEBIT' },
	{ code: '5-1000', name: 'Harga Pokok Penjualan (HPP)', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-0000' },
	{ code: '5-1001', name: 'HPP — Bahan Baku', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-1000' },
	{ code: '5-1002', name: 'HPP — Tenaga Kerja Langsung', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-1000' },
	{ code: '5-1003', name: 'HPP — Overhead Pabrik', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-1000' },
	{ code: '5-2000', name: 'Beban Operasional', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-0000' },
	{ code: '5-2001', name: 'Beban Gaji & Tunjangan', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2002', name: 'Beban BPJS', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2003', name: 'Beban Sewa', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2004', name: 'Beban Listrik & Air', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2005', name: 'Beban Telepon & Internet', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2006', name: 'Beban Pemasaran & Iklan', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2007', name: 'Beban Perjalanan Dinas', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2008', name: 'Beban Perlengkapan Kantor', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2009', name: 'Beban Penyusutan', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2010', name: 'Beban Administrasi Bank', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2011', name: 'Beban Asuransi', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2012', name: 'Beban Pemeliharaan & Reparasi', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2013', name: 'Beban Konsultan & Profesional', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-3000', name: 'Beban Lain-lain', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-0000' },
	{ code: '5-3001', name: 'Beban Bunga', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-3000' },
	{ code: '5-3002', name: 'Kerugian Penjualan Aset', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-3000' },
	{ code: '5-3003', name: 'Beban Pajak Penghasilan', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-3000' }
];
