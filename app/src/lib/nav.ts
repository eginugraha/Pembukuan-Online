import { roleAtLeast, type Role } from './roles';

export interface NavItem {
	label: string;
	href: string;
	min: Role;
	/** Key ikon lucide; dipetakan ke komponen di AppSidebar.svelte. */
	icon: string;
}
export interface NavGroup {
	label: string | null;
	items: NavItem[];
}

// Laporan keuangan selain Neraca, CALK, export, dan preferensi sistem belum dibangun di slice ini.
export const NAV: NavGroup[] = [
	{ label: null, items: [{ label: 'Dashboard', href: '/dashboard', min: 'viewer', icon: 'dashboard' }] },
	{
		label: 'eStatement',
		items: [
			{ label: 'Upload Baru', href: '/uploads/new', min: 'accountant', icon: 'upload' },
			{ label: 'Riwayat Upload', href: '/uploads', min: 'viewer', icon: 'history' }
		]
	},
	{ label: null, items: [{ label: 'Review & Konfirmasi', href: '/review', min: 'accountant', icon: 'review' }] },
	{ label: 'Jurnal', items: [{ label: 'Jurnal Umum', href: '/journal', min: 'viewer', icon: 'journal' }] },
	{
		label: 'Buku',
		items: [
			{ label: 'Buku Besar', href: '/ledger', min: 'viewer', icon: 'ledger' },
			{ label: 'Neraca Saldo', href: '/trial-balance', min: 'viewer', icon: 'scale' }
		]
	},
	{ label: 'Laporan Keuangan', items: [{ label: 'Posisi Keuangan (Neraca)', href: '/balance-sheet', min: 'viewer', icon: 'landmark' }] },
	{
		label: 'Pengaturan',
		items: [
			{ label: 'Perusahaan', href: '/settings/company', min: 'admin', icon: 'company' },
			{ label: 'Pengguna & Role', href: '/settings/users', min: 'admin', icon: 'users' },
			{ label: 'Chart of Accounts', href: '/settings/accounts', min: 'admin', icon: 'accounts' },
			{ label: 'Category Rules', href: '/settings/rules', min: 'accountant', icon: 'rules' },
			{ label: 'Saldo Awal', href: '/settings/opening-balance', min: 'accountant', icon: 'wallet' }
		]
	}
];

export function visibleNav(role: Role | null): NavGroup[] {
	return NAV.map((g) => ({ ...g, items: g.items.filter((i) => roleAtLeast(role, i.min)) })).filter(
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
