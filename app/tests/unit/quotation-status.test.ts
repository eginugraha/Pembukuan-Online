import { describe, expect, test } from 'bun:test';
import { QUOTATION_STATUS_LABEL, quotationNo, quotationStatus } from '$lib/quotation-status';

describe('quotationStatus', () => {
	const latest = { approvedAt: null, isLatest: true };
	test('valid until today is still pending; the day after it is expired', () => {
		expect(quotationStatus({ ...latest, validUntil: '2026-10-29' }, '2026-10-29')).toBe('pending');
		expect(quotationStatus({ ...latest, validUntil: '2026-10-29' }, '2026-10-30')).toBe('expired');
	});
	test('without a valid-until date it never expires', () => {
		expect(quotationStatus({ ...latest, validUntil: null }, '2099-01-01')).toBe('pending');
	});
	test('approved wins over an expired date', () => {
		expect(quotationStatus({ approvedAt: new Date('2026-11-05'), validUntil: '2026-10-29', isLatest: true }, '2026-11-10')).toBe('approved');
	});
	test('an older version is revised even if it was approved', () => {
		expect(quotationStatus({ approvedAt: new Date(), validUntil: null, isLatest: false }, '2026-10-29')).toBe('revised');
	});
	test('labels', () => {
		expect(QUOTATION_STATUS_LABEL).toEqual({ pending: 'Menunggu', approved: 'Disetujui', expired: 'Kedaluwarsa', revised: 'Direvisi' });
	});
});

describe('quotationNo', () => {
	test('revision 0 has no suffix; later revisions get -R<n>', () => {
		expect(quotationNo('001/A-B/QUO/X/2026', 0)).toBe('001/A-B/QUO/X/2026');
		expect(quotationNo('001/A-B/QUO/X/2026', 2)).toBe('001/A-B/QUO/X/2026-R2');
	});
});
