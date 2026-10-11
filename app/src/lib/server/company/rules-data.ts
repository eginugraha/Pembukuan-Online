export interface RuleSeed {
	keyword: string;
	account: string;
	direction: 'DB' | 'CR';
}

// D11: setiap rule seed punya arah. "BI-FAST" dari PRD sengaja tidak dimasukkan
// karena teks itu juga muncul pada transfer masuk (akan salah tercatat sebagai beban bank).
export const DEFAULT_RULES: RuleSeed[] = [
	// Bank & Admin
	{ keyword: 'BIAYA ADM', account: '5-2010', direction: 'DB' },
	{ keyword: 'PROVISI', account: '5-2010', direction: 'DB' },
	{ keyword: 'BUNGA PINJAMAN', account: '5-3001', direction: 'DB' },
	{ keyword: 'BUNGA TABUNGAN', account: '4-2001', direction: 'CR' },
	// Marketplace (uang masuk = penjualan)
	{ keyword: 'TOKOPEDIA', account: '4-1002', direction: 'CR' },
	{ keyword: 'SHOPEE', account: '4-1002', direction: 'CR' },
	{ keyword: 'LAZADA', account: '4-1002', direction: 'CR' },
	{ keyword: 'BUKALAPAK', account: '4-1002', direction: 'CR' },
	// Ride & Delivery
	{ keyword: 'GOJEK', account: '5-2006', direction: 'DB' },
	{ keyword: 'GRAB', account: '5-2006', direction: 'DB' },
	// Utilitas
	{ keyword: 'PLN', account: '5-2004', direction: 'DB' },
	{ keyword: 'PDAM', account: '5-2004', direction: 'DB' },
	{ keyword: 'TELKOM', account: '5-2005', direction: 'DB' },
	{ keyword: 'INDOSAT', account: '5-2005', direction: 'DB' },
	{ keyword: 'XL AXIATA', account: '5-2005', direction: 'DB' },
	// BPJS
	{ keyword: 'BPJS KESEHATAN', account: '5-2002', direction: 'DB' },
	{ keyword: 'BPJS KETENAGAKERJAAN', account: '5-2002', direction: 'DB' },
	// Retail
	{ keyword: 'ALFAMART', account: '5-2008', direction: 'DB' },
	{ keyword: 'INDOMARET', account: '5-2008', direction: 'DB' }
];
