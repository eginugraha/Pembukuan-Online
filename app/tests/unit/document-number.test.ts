import { describe, expect, test } from 'bun:test';
import { formatDocumentNumber, toRoman } from '$lib/document-number';

describe('document number', () => {
	test('formatDocumentNumber', () => {
		expect(
			formatDocumentNumber({ seq: 1, companyCode: 'SET', contactCode: 'XFORMATION', kind: 'INV', issueDate: '2026-04-15' })
		).toBe('001/SET-XFORMATION/INV/IV/2026');
		expect(
			formatDocumentNumber({ seq: 1000, companyCode: 'A', contactCode: 'B', kind: 'PO', issueDate: '2026-12-01' })
		).toBe('1000/A-B/PO/XII/2026');
		expect(
			formatDocumentNumber({ seq: 1, companyCode: 'SET', contactCode: 'XFORMATION', kind: 'RCP', issueDate: '2026-04-15' })
		).toBe('001/SET-XFORMATION/RCP/IV/2026');
		expect(formatDocumentNumber({ seq: 1, companyCode: 'SAB', contactCode: 'PLG', kind: 'QUO', issueDate: '2026-10-29' })).toBe('001/SAB-PLG/QUO/X/2026');
	});
	test('toRoman', () => {
		expect([1, 4, 9, 12].map(toRoman)).toEqual(['I', 'IV', 'IX', 'XII']);
	});
});
