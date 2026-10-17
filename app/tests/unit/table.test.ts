import { expect, test } from 'bun:test';
import { nextSort, view, type Column } from '$lib/table';

type Row = { id: number; name: string; code: string; amount: number };
const cols: Column<Row>[] = [
	{ key: 'code', label: 'Kode', sortable: true, searchable: true },
	{ key: 'name', label: 'Nama', sortable: true, searchable: true },
	{ key: 'amount', label: 'Jumlah', sortable: true, sortValue: (r) => r.amount }
];
const rows: Row[] = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, code: `1-${1000 + i}`, name: i % 2 ? `Kas ${i}` : `Beban ${i}`, amount: (i * 37) % 100 }));
const base = { query: '', sort: null, page: 1, pageSize: 10 };

test('nextSort cycles asc → desc → none, and a new column starts at asc', () => {
	expect(nextSort(null, 'name')).toEqual({ key: 'name', dir: 'asc' });
	expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
	expect(nextSort({ key: 'name', dir: 'desc' }, 'name')).toBeNull();
	expect(nextSort({ key: 'name', dir: 'desc' }, 'code')).toEqual({ key: 'code', dir: 'asc' });
});

test('search matches searchable columns only, case-insensitive', () => {
	const v = view(rows, cols, { ...base, query: 'KAS', pageSize: 50 });
	expect(v.filtered).toBe(11);
	expect(v.rows.every((r) => r.name.startsWith('Kas'))).toBe(true);
	// amount tidak searchable: "37" hanya cocok bila muncul di kode/nama.
	expect(view(rows, cols, { ...base, query: '1-1003', pageSize: 50 }).rows.map((r) => r.id)).toEqual([4]);
	expect(view(rows, cols, { ...base, query: 'zzz' }).filtered).toBe(0);
});

test('sorting uses sortValue for numbers and Indonesian collation for text', () => {
	const byAmount = view(rows, cols, { ...base, sort: { key: 'amount', dir: 'asc' }, pageSize: 50 }).rows.map((r) => r.amount);
	expect(byAmount).toEqual([...byAmount].sort((a, b) => a - b));
	const desc = view(rows, cols, { ...base, sort: { key: 'name', dir: 'desc' }, pageSize: 50 }).rows.map((r) => r.name);
	expect(desc).toEqual([...desc].sort((a, b) => b.localeCompare(a, 'id', { numeric: true })));
	expect(view([{ id: 1, name: 'Kas 11', code: 'a', amount: 0 }, { id: 2, name: 'Kas 3', code: 'b', amount: 0 }], cols, { ...base, sort: { key: 'name', dir: 'asc' } }).rows.map((r) => r.name)).toEqual(['Kas 3', 'Kas 11']);
	// Tanpa sort: urutan asal dipertahankan.
	expect(view(rows, cols, { ...base, pageSize: 50 }).rows.map((r) => r.id)).toEqual(rows.map((r) => r.id));
});

test('pagination with range info and clamping', () => {
	const p3 = view(rows, cols, { ...base, page: 3 });
	expect([p3.pageCount, p3.rows.length, p3.from, p3.to, p3.total, p3.page]).toEqual([3, 3, 21, 23, 23, 3]);
	expect(view(rows, cols, { ...base, page: 9 }).page).toBe(3);
	expect(view(rows, cols, { ...base, page: 0 }).page).toBe(1);
	const empty = view([] as Row[], cols, base);
	expect([empty.pageCount, empty.from, empty.to, empty.rows.length]).toEqual([1, 0, 0, 0]);
});
