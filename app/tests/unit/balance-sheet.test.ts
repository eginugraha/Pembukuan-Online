import { expect, test } from 'bun:test';
import { fiscalYearStart } from '../../src/lib/server/reports/balance-sheet';

test('fiscal year start follows the configured start month', () => {
	expect(fiscalYearStart('2026-08-31', 'JANUARY')).toBe('2026-01-01');
	expect(fiscalYearStart('2026-01-01', 'JANUARY')).toBe('2026-01-01');
	expect(fiscalYearStart('2026-08-31', 'JULY')).toBe('2026-07-01');
	expect(fiscalYearStart('2026-06-30', 'JULY')).toBe('2025-07-01');
	expect(fiscalYearStart('2026-08-31', 'bogus')).toBe('2026-01-01');
});
