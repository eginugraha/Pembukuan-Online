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
