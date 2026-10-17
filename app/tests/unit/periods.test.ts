import { expect, test } from 'bun:test';
import { dayBefore, defaultBalanceSheetAsOf, defaultReportRange, formatDateLong, formatPeriod, previousFiscalYearEnd, shiftYears } from '../../src/lib/periods';

test('period helpers', () => {
	expect(dayBefore('2026-01-01')).toBe('2025-12-31');
	expect(dayBefore('2024-03-01')).toBe('2024-02-29');
	expect(previousFiscalYearEnd('2026-12-31', 'JANUARY')).toBe('2025-12-31');
	expect(previousFiscalYearEnd('2026-06-30', 'JULY')).toBe('2025-06-30');
	expect(shiftYears('2024-02-29', -1)).toBe('2023-02-28');
	expect(shiftYears('2026-12-31', -1)).toBe('2025-12-31');
	expect(shiftYears('2029-02-28', -1)).toBe('2028-02-29');
	expect(shiftYears('2026-02-15', -1)).toBe('2025-02-15');
	expect(defaultReportRange('2026-10-18', 'JANUARY')).toEqual({ from: '2026-01-01', to: '2026-10-31' });
	expect(defaultReportRange('2026-03-05', 'JULY')).toEqual({ from: '2025-07-01', to: '2026-03-31' });
	expect(defaultBalanceSheetAsOf('2026-10-18', 'JANUARY')).toBe('2026-10-31');
	expect(defaultBalanceSheetAsOf('2027-01-10', 'JANUARY')).toBe('2026-12-31');
	expect(defaultBalanceSheetAsOf('2026-07-03', 'JULY')).toBe('2026-06-30');
	expect(formatDateLong('2026-01-01')).toBe('1 Januari 2026');
	expect(formatPeriod('2026-01-01', '2026-12-31')).toBe('1 Januari 2026 – 31 Desember 2026');
});
