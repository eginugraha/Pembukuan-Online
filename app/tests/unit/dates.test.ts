import { expect, test } from 'bun:test';
import { formatDate, monthRange } from '$lib/dates';

test('monthRange returns first and last day of month', () => {
	expect(monthRange('2026-08-15')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
	expect(monthRange('2028-02-03')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
	expect(monthRange('2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
});


test('formatDate renders dd/mm/yyyy', () => {
	expect(formatDate('2026-08-02')).toBe('02/08/2026');
	expect(formatDate(null)).toBe('');
});

import { todayIso } from '$lib/dates';

test('todayIso follows Asia/Jakarta (UTC+7), not the server timezone', () => {
	// 20:00 UTC tanggal 31 Agustus sudah 03:00 tanggal 1 September di Jakarta.
	expect(todayIso(new Date('2026-08-31T20:00:00Z'))).toBe('2026-09-01');
	expect(todayIso(new Date('2026-08-31T16:59:00Z'))).toBe('2026-08-31');
	expect(todayIso(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01-01');
});
