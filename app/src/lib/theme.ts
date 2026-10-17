export const THEME_KEY = 'jk-theme';
export type ThemeMode = 'dark' | 'light' | 'system';
export const DEFAULT_THEME: ThemeMode = 'dark';

const isMode = (v: unknown): v is ThemeMode => v === 'dark' || v === 'light' || v === 'system';

export function readTheme(): ThemeMode {
	try {
		const v = localStorage.getItem(THEME_KEY);
		return isMode(v) ? v : DEFAULT_THEME;
	} catch {
		return DEFAULT_THEME;
	}
}

let systemQuery: MediaQueryList | null = null;
const onSystemChange = () => paint('system');

function paint(mode: ThemeMode) {
	const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
	const root = document.documentElement;
	root.classList.toggle('dark', dark);
	root.style.colorScheme = dark ? 'dark' : 'light';
}

/**
 * Terapkan & simpan tema. Logika paint sama dengan skrip inline di src/app.html (yang berjalan
 * sebelum halaman digambar agar tidak ada kedipan); ubah keduanya bersamaan.
 */
export function applyTheme(mode: ThemeMode) {
	try {
		localStorage.setItem(THEME_KEY, mode);
	} catch {
		// Penyimpanan diblokir (mis. mode privat): tema tetap berlaku untuk halaman ini.
	}
	systemQuery?.removeEventListener('change', onSystemChange);
	systemQuery = null;
	if (mode === 'system') {
		systemQuery = matchMedia('(prefers-color-scheme: dark)');
		systemQuery.addEventListener('change', onSystemChange);
	}
	paint(mode);
}
