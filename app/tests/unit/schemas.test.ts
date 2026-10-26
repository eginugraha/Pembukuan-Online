import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreateAccountInput } from '$lib/schemas/account';
import { CreateCompanyInput, UpdateCompanyInput } from '$lib/schemas/company';
import { LoginInput } from '$lib/schemas/login';
import { AddMemberInput } from '$lib/schemas/member';
import { OpeningInput } from '$lib/schemas/opening';
import { UpdateProfileInput } from '$lib/schemas/profile';
import { CreateRuleInput } from '$lib/schemas/rule';
import { ManualEntryInput } from '$lib/schemas/upload';
import { DEFAULT_COA } from '../../src/lib/server/company/coa-data';
import { IT_COA } from '../../src/lib/server/company/coa-it';

const UUID = '00000000-0000-4000-8000-000000000000';
const noEnglish = (errs: Record<string, string>) => Object.values(errs).every((m) => !/\b(Too|Invalid|Required|expected)\b/.test(m));

test('fieldErrors returns {} for valid input', () => {
	expect(fieldErrors(CreateAccountInput, { code: '1-1008', name: 'Kas Kecil', parentId: UUID })).toEqual({});
});

test('account: empty form reports every required field in Indonesian', () => {
	const e = fieldErrors(CreateAccountInput, {});
	expect(Object.keys(e).sort()).toEqual(['code', 'name', 'parentId']);
	expect(e.code).toBe('Kode wajib diisi');
	expect(e.name).toBe('Nama wajib diisi');
	expect(e.parentId).toBe('Akun induk wajib dipilih');
	expect(fieldErrors(CreateAccountInput, { code: '1-10A', name: 'X', parentId: UUID }).code).toBe('Kode hanya boleh angka dan tanda hubung, mis. 1-1008');
});

test('every template account code passes the code rule', () => {
	for (const a of [...DEFAULT_COA, ...IT_COA]) expect(CreateAccountInput.shape.code.safeParse(a.code).success).toBe(true);
});

test('login messages', () => {
	expect(fieldErrors(LoginInput, { email: 'x', password: '' })).toEqual({ email: 'Format email tidak valid', password: 'Password wajib diisi' });
	expect(fieldErrors(LoginInput, { email: '', password: 'a' }).email).toBe('Email wajib diisi');
});

test('rule keyword must have at least 3 characters after trim', () => {
	expect(fieldErrors(CreateRuleInput, { keyword: ' ab ', accountId: UUID }).keyword).toBe('Keyword rule minimal 3 karakter');
	expect(fieldErrors(CreateRuleInput, { keyword: 'abc' }).accountId).toBe('Akun wajib dipilih');
});

test('member, company, profile, opening speak Indonesian', () => {
	const m = fieldErrors(AddMemberInput, { email: 'x', password: '123', role: 'admin' });
	expect(m).toEqual({ email: 'Format email tidak valid', password: 'Password minimal 8 karakter' });
	expect(fieldErrors(CreateCompanyInput, { name: ' ' }).name).toBe('Nama perusahaan wajib diisi');
	expect(fieldErrors(UpdateCompanyInput, { name: 'PT A', npwp: 'x'.repeat(21) }).npwp).toBe('NPWP maksimal 20 karakter');
	expect(fieldErrors(UpdateProfileInput, { name: '  ' }).name).toBe('Nama wajib diisi');
	const o = fieldErrors(OpeningInput, { date: '', lines: [] });
	expect(o.date).toBe('Tanggal wajib diisi');
	for (const e of [m, o]) expect(noEnglish(e)).toBe(true);
});

import { ChangePasswordInput } from '$lib/schemas/profile';

test('change-password messages are Indonesian and field-specific', () => {
	expect(fieldErrors(ChangePasswordInput, {})).toMatchObject({
		currentPassword: 'Password saat ini wajib diisi',
		newPassword: 'Password baru wajib diisi',
		confirmPassword: 'Konfirmasi password wajib diisi'
	});
	expect(fieldErrors(ChangePasswordInput, { currentPassword: 'a', newPassword: 'abc', confirmPassword: 'abc' }).newPassword).toBe('Password baru minimal 8 karakter');
	expect(fieldErrors(ChangePasswordInput, { currentPassword: 'a', newPassword: 'password-baru', confirmPassword: 'lain' })).toEqual({ confirmPassword: 'Konfirmasi password tidak sama' });
	expect(fieldErrors(ChangePasswordInput, { currentPassword: 'sama-sama-1', newPassword: 'sama-sama-1', confirmPassword: 'sama-sama-1' })).toEqual({
		newPassword: 'Password baru harus berbeda dari password saat ini'
	});
	expect(fieldErrors(ChangePasswordInput, { currentPassword: 'lama-lama-1', newPassword: 'baru-baru-2', confirmPassword: 'baru-baru-2' })).toEqual({});
});

test('manual entry: required fields, and a row amount of zero is rejected', () => {
	// `rows: []` (not omitted) so the array's own `.min(1)` message fires, not Zod's
	// default "expected array, received undefined" for a missing key.
	expect(fieldErrors(ManualEntryInput, { bank: '', accountNo: '', rows: [] })).toMatchObject({
		bank: 'Nama bank wajib diisi',
		accountNo: 'Nomor rekening wajib diisi',
		rows: 'Isi minimal satu baris transaksi'
	});
	const valid = { bank: 'Mandiri', accountNo: '123', rows: [{ date: '2026-08-01', description: 'Transfer', direction: 'DB', amount: '10000' }] };
	expect(fieldErrors(ManualEntryInput, valid)).toEqual({});
	const zero = { ...valid, rows: [{ ...valid.rows[0], amount: '0' }] };
	expect(fieldErrors(ManualEntryInput, zero).rows).toBe('Jumlah harus lebih dari 0');
});

test('documentCode: trim, uppercase, kosong menjadi null, tolak format salah', async () => {
	const { documentCode } = await import('$lib/schemas/common');
	expect(documentCode.parse(' set ')).toBe('SET');
	expect(documentCode.parse('')).toBeNull();
	expect(documentCode.parse(null)).toBeNull();
	expect(documentCode.parse(undefined)).toBeUndefined();
	expect(documentCode.safeParse('SET-A').success).toBe(false);
	expect(documentCode.safeParse('A'.repeat(16)).success).toBe(false);
	expect(documentCode.safeParse('A'.repeat(15)).success).toBe(true);
});

test('UpdateCompanyInput menerima field baru dan swiftCode di-uppercase', () => {
	const r = UpdateCompanyInput.parse({ name: 'PT A', code: 'set', swiftCode: ' cenaidja ', email: '', bankName: 'BCA' });
	expect(r.code).toBe('SET');
	expect(r.swiftCode).toBe('CENAIDJA');
	expect(UpdateCompanyInput.safeParse({ name: 'PT A', email: 'bukan-email' }).success).toBe(false);
	expect(UpdateCompanyInput.safeParse({ name: 'PT A', swiftCode: 'A'.repeat(12) }).success).toBe(false);
});
