import type { NavGroup, NavItem } from './nav';

export interface Crumb {
	label: string;
	href?: string;
}

const HOME: Crumb = { label: 'Dashboard', href: '/dashboard' };
const EXTRA: Record<string, string> = { '/profile': 'Profil Saya' };

export function buildBreadcrumb(pathname: string, nav: NavGroup[], crumb?: string): Crumb[] {
	let best: { group: NavGroup; item: NavItem } | null = null;
	for (const group of nav) {
		for (const item of group.items) {
			const match = pathname === item.href || pathname.startsWith(`${item.href}/`);
			if (match && (!best || item.href.length > best.item.href.length)) best = { group, item };
		}
	}

	if (!best) {
		const extra = EXTRA[pathname];
		const out: Crumb[] = [{ ...HOME }];
		if (extra) out.push({ label: extra });
		else if (crumb) out.push({ label: crumb });
		return out;
	}

	const { group, item } = best;
	if (item.href === '/dashboard' && pathname === item.href) return [{ label: 'Dashboard' }];

	const out: Crumb[] = [{ ...HOME }];
	if (group.label) out.push({ label: group.label });
	if (pathname === item.href && !crumb) {
		out.push({ label: item.label });
	} else {
		out.push({ label: item.label, href: item.href });
		if (crumb) out.push({ label: crumb });
	}
	return out;
}
