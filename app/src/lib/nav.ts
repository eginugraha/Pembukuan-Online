import { roleAtLeast, type Role } from './roles';

export interface NavItem {
	label: string;
	href: string;
	min: Role;
}
export interface NavGroup {
	label: string | null;
	items: NavItem[];
}

// Laporan keuangan selain Neraca, CALK, export, dan preferensi sistem belum dibangun di slice ini.
export const NAV: NavGroup[] = [
	{ label: null, items: [{ label: 'Dashboard', href: '/dashboard', min: 'viewer' }] },
	{
		label: 'eStatement',
		items: [
			{ label: 'Upload Baru', href: '/uploads/new', min: 'accountant' },
			{ label: 'Riwayat Upload', href: '/uploads', min: 'viewer' }
		]
	},
	{ label: null, items: [{ label: 'Review & Konfirmasi', href: '/review', min: 'accountant' }] },
	{ label: 'Jurnal', items: [{ label: 'Jurnal Umum', href: '/journal', min: 'viewer' }] },
	{
		label: 'Buku',
		items: [
			{ label: 'Buku Besar', href: '/ledger', min: 'viewer' },
			{ label: 'Neraca Saldo', href: '/trial-balance', min: 'viewer' }
		]
	},
	{ label: 'Laporan Keuangan', items: [{ label: 'Posisi Keuangan (Neraca)', href: '/balance-sheet', min: 'viewer' }] },
	{
		label: 'Pengaturan',
		items: [
			{ label: 'Perusahaan', href: '/settings/company', min: 'admin' },
			{ label: 'Pengguna & Role', href: '/settings/users', min: 'admin' },
			{ label: 'Chart of Accounts', href: '/settings/accounts', min: 'admin' },
			{ label: 'Category Rules', href: '/settings/rules', min: 'accountant' },
			{ label: 'Saldo Awal', href: '/settings/opening-balance', min: 'accountant' }
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
