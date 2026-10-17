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
