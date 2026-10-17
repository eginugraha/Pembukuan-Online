const JAKARTA = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Tanggal hari ini (YYYY-MM-DD) di Asia/Jakarta, bukan zona waktu server atau browser, agar server dan klien sepakat. */
export function todayIso(now: Date = new Date()): string {
	return JAKARTA.format(now);
}

export function monthRange(date: string): { from: string; to: string } {
	const [y, m] = date.split('-').map(Number);
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
	const mm = String(m).padStart(2, '0');
	return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

export function formatDate(iso: string | null | undefined): string {
	if (!iso) return '';
	const [y, m, d] = iso.slice(0, 10).split('-');
	return `${d}/${m}/${y}`;
}
