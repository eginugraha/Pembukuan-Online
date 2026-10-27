export const SIDEBAR_KEY = 'jk-sidebar';
export type SidebarState = 'expanded' | 'collapsed';

export function readSidebar(): SidebarState {
	try {
		return localStorage.getItem(SIDEBAR_KEY) === 'collapsed' ? 'collapsed' : 'expanded';
	} catch {
		return 'expanded';
	}
}

/**
 * Simpan & terapkan status sidebar. Atribut `data-sidebar` di <html> juga dipasang oleh skrip inline
 * di src/app.html sebelum halaman digambar (agar lebar tidak melompat saat dimuat); ubah keduanya bersamaan.
 */
export function applySidebar(state: SidebarState) {
	try {
		localStorage.setItem(SIDEBAR_KEY, state);
	} catch {
		// Penyimpanan diblokir: status tetap berlaku untuk halaman ini.
	}
	if (state === 'collapsed') document.documentElement.dataset.sidebar = 'collapsed';
	else delete document.documentElement.dataset.sidebar;
}

export const GROUPS_KEY = 'jk-nav-closed';

/** Judul grup menu yang sedang ditutup. */
export function readClosedGroups(): string[] {
	try {
		const v = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]');
		return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

export function saveClosedGroups(labels: string[]) {
	try {
		localStorage.setItem(GROUPS_KEY, JSON.stringify(labels));
	} catch {
		// Penyimpanan diblokir: pilihan tetap berlaku untuk halaman ini.
	}
}
