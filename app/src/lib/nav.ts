import { roleAtLeast, type Role } from './roles';

export interface NavItem {
	label: string;
	href: string;
	min: Role;
	/** Key ikon lucide; dipetakan ke komponen di AppSidebar.svelte. */
	icon: string;
	/** Hanya tampil untuk Super Admin, termasuk yang belum punya perusahaan aktif. */
	superAdminOnly?: boolean;
}
export interface NavGroup {
	label: string | null;
	/** Key ikon judul grup (hanya untuk grup bertajuk); dipetakan di AppSidebar.svelte. */
	icon?: string;
	items: NavItem[];
}

// Laporan keuangan selain Neraca, CALK, export, dan preferensi sistem belum dibangun di slice ini.
export const NAV: NavGroup[] = [
	{ label: null, items: [{ label: 'Dashboard', href: '/dashboard', min: 'viewer', icon: 'dashboard' }] },
	{
		label: 'eStatement',
		icon: 'estatement',
		items: [
			{ label: 'Upload Baru', href: '/uploads/new', min: 'accountant', icon: 'upload' },
			{ label: 'Riwayat Upload', href: '/uploads', min: 'viewer', icon: 'history' },
			{ label: 'Review & Konfirmasi', href: '/review', min: 'accountant', icon: 'review' }
		]
	},
	{ label: 'Jurnal', icon: 'journalGroup', items: [{ label: 'Jurnal Umum', href: '/journal', min: 'viewer', icon: 'journal' }] },
	{
		label: 'Buku',
		icon: 'books',
		items: [
			{ label: 'Buku Besar', href: '/ledger', min: 'viewer', icon: 'ledger' },
			{ label: 'Neraca Saldo', href: '/trial-balance', min: 'viewer', icon: 'scale' }
		]
	},
	{
		label: 'Invoicing',
		icon: 'invoicing',
		items: [
			{ label: 'Kontak', href: '/invoicing/contacts', min: 'viewer', icon: 'contacts' },
			{ label: 'Penawaran', href: '/invoicing/quotations', min: 'viewer', icon: 'quotation' },
			{ label: 'Invoice', href: '/invoicing/invoices', min: 'viewer', icon: 'invoice' },
			{ label: 'Purchase Order', href: '/invoicing/purchase-orders', min: 'viewer', icon: 'po' }
		]
	},
	{
		label: 'Laporan Keuangan',
		icon: 'reports',
		items: [
			{ label: 'Laba Rugi', href: '/income-statement', min: 'viewer', icon: 'income' },
			{ label: 'Posisi Keuangan', href: '/balance-sheet', min: 'viewer', icon: 'landmark' }
		]
	},
	{
		label: 'Pengaturan',
		icon: 'settings',
		items: [
			{ label: 'Perusahaan', href: '/settings/company', min: 'admin', icon: 'company' },
			{ label: 'Chart of Accounts', href: '/settings/accounts', min: 'admin', icon: 'accounts' },
			{ label: 'Category Rules', href: '/settings/rules', min: 'accountant', icon: 'rules' },
			{ label: 'Saldo Awal', href: '/settings/opening-balance', min: 'accountant', icon: 'wallet' },
			{ label: 'Tutup Buku', href: '/settings/closing', min: 'admin', icon: 'closing' }
		]
	},
	{
		label: 'RBAC',
		icon: 'rbac',
		items: [
			{ label: 'Semua Pengguna', href: '/settings/system-users', min: 'viewer', icon: 'systemUsers', superAdminOnly: true },
			{ label: 'Pengguna & Role', href: '/settings/users', min: 'admin', icon: 'users' }
		]
	}
];

export function visibleNav(role: Role | null, isSuperAdmin = false): NavGroup[] {
	const show = (i: NavItem) => (i.superAdminOnly ? isSuperAdmin : roleAtLeast(role, i.min));
	return NAV.map((g) => ({ ...g, items: g.items.filter(show) })).filter(
		(g) => g.items.length > 0
	);
}

export function minRoleForPath(pathname: string): Role | null {
	let best: NavItem | null = null;
	for (const g of NAV) {
		for (const i of g.items) {
			const match = pathname === i.href || pathname.startsWith(`${i.href}/`);
			if (match && (!best || i.href.length > best.href.length)) best = i;
		}
	}
	return best?.min ?? null;
}

const SUPER_ADMIN_NO_COMPANY_PATHS = ['/settings/company', '/settings/system-users'];

/** Halaman yang tetap dapat dibuka tanpa perusahaan aktif: /profile untuk siapa pun, sisanya khusus Super Admin. */
export function allowsWithoutCompany(pathname: string, isSuperAdmin: boolean): boolean {
	const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
	if (under('/profile')) return true;
	return isSuperAdmin && SUPER_ADMIN_NO_COMPANY_PATHS.some(under);
}
