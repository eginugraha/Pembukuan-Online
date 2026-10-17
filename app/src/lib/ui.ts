const base =
	'rounded-xl border border-input bg-field px-3 text-sm shadow-[0_2px_8px_-6px_rgb(20_33_15/0.25)] transition-shadow focus-visible:outline-none focus-visible:border-green focus-visible:ring-3 focus-visible:ring-green/25 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20';
// Select memakai chevron sendiri (lihat .select-chevron); padding kanan memberi ruang untuk panahnya.
export const selectClass = `select-chevron h-10 w-full ${base.replace('px-3', 'pl-3 pr-10')}`;
export const inputClass = `h-10 w-full ${base}`;
