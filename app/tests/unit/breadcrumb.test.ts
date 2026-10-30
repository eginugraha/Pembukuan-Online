import { describe, expect, test } from 'bun:test';
import { buildBreadcrumb } from '../../src/lib/breadcrumb';
import { NAV } from '../../src/lib/nav';

const labels = (p: string, c?: string) => buildBreadcrumb(p, NAV, c).map((x) => x.label);

describe('buildBreadcrumb', () => {
	test('report page', () => {
		const r = buildBreadcrumb('/income-statement', NAV);
		expect(r.map((x) => x.label)).toEqual(['Dashboard', 'Laporan Keuangan', 'Laba Rugi']);
		expect(r.map((x) => x.href)).toEqual(['/dashboard', undefined, undefined]);
	});
	test('settings', () => expect(labels('/settings/closing')).toEqual(['Dashboard', 'Pengaturan', 'Tutup Buku']));
	test('review under eStatement', () => expect(labels('/review')).toEqual(['Dashboard', 'eStatement', 'Review & Konfirmasi']));
	test('longest match', () => expect(labels('/uploads/new')).toEqual(['Dashboard', 'eStatement', 'Upload Baru']));
	test('detail with crumb', () => {
		const r = buildBreadcrumb('/uploads/abc', NAV, 'BCA Jan.pdf');
		expect(r.map((x) => x.label)).toEqual(['Dashboard', 'eStatement', 'Riwayat Upload', 'BCA Jan.pdf']);
		expect(r[2].href).toBe('/uploads');
	});
	test('ar-ap under Invoicing', () => expect(labels('/invoicing/ar-ap')).toEqual(['Dashboard', 'Invoicing', 'Piutang & Hutang']));
	test('profile', () => expect(labels('/profile')).toEqual(['Dashboard', 'Profil Saya']));
	test('dashboard', () => expect(buildBreadcrumb('/dashboard', NAV)).toEqual([{ label: 'Dashboard' }]));
	test('unknown', () => expect(labels('/tidak-dikenal')).toEqual(['Dashboard']));
});
