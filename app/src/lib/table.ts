export interface Column<T> {
	key: string;
	label: string;
	sortable?: boolean;
	searchable?: boolean;
	align?: 'left' | 'right';
	/** Nilai untuk pengurutan (mis. angka/tanggal); default teks sel. */
	sortValue?: (row: T) => string | number;
	/** Teks sel untuk pencarian & urut teks; default String(row[key]). */
	text?: (row: T) => string;
}
export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

/** Klik header: naik → turun → urutan asal; kolom lain mulai dari naik. */
export function nextSort(current: SortState, key: string): SortState {
	if (!current || current.key !== key) return { key, dir: 'asc' };
	return current.dir === 'asc' ? { key, dir: 'desc' } : null;
}

const cellText = <T>(row: T, col: Column<T>) => (col.text ? col.text(row) : String((row as Record<string, unknown>)[col.key] ?? ''));

/** Cari (substring, tanpa membedakan huruf besar/kecil) → urut → potong halaman. Halaman dijepit ke [1, pageCount]. */
export function view<T>(rows: T[], cols: Column<T>[], opts: { query: string; sort: SortState; page: number; pageSize: number }) {
	const q = opts.query.trim().toLowerCase();
	const searchable = cols.filter((c) => c.searchable);
	let out = q ? rows.filter((r) => searchable.some((c) => cellText(r, c).toLowerCase().includes(q))) : rows.slice();

	const col = opts.sort ? cols.find((c) => c.key === opts.sort!.key) : undefined;
	if (opts.sort && col) {
		const sign = opts.sort.dir === 'asc' ? 1 : -1;
		const val = (r: T) => (col.sortValue ? col.sortValue(r) : cellText(r, col));
		out = out
			.map((r, i) => ({ r, i, v: val(r) }))
			.sort((a, b) => {
				const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'id', { numeric: true });
				return c * sign || a.i - b.i;
			})
			.map((x) => x.r);
	}

	const filtered = out.length;
	const pageCount = Math.max(1, Math.ceil(filtered / opts.pageSize));
	const page = Math.min(Math.max(1, opts.page), pageCount);
	const start = (page - 1) * opts.pageSize;
	const pageRows = out.slice(start, start + opts.pageSize);
	return {
		rows: pageRows,
		total: rows.length,
		filtered,
		page,
		pageCount,
		from: filtered === 0 ? 0 : start + 1,
		to: start + pageRows.length
	};
}
