import { expect, test } from 'bun:test';
import { splitServerFields } from '$lib/forms/validation';
import { accountSearchText } from '$lib/account-options';

test('server errors for known form fields are matched; unknown keys are reported', () => {
	expect(splitServerFields({ code: 'Kode dipakai' }, ['code', 'name'])).toEqual({ matched: { code: 'Kode dipakai' }, unmatched: [] });
	expect(splitServerFields({ code: 'x', _: 'umum', lines: 'y' }, ['code'])).toEqual({ matched: { code: 'x' }, unmatched: ['_', 'lines'] });
	expect(splitServerFields({}, ['code'])).toEqual({ matched: {}, unmatched: [] });
});

test('account search text covers the assigned account, or the suggested one by code and name', () => {
	expect(accountSearchText({ accountCode: '5-2010', accountName: 'Beban Administrasi Bank', suggestedCode: '5-2001', suggestedName: 'Gaji' })).toBe('5-2010 Beban Administrasi Bank');
	expect(accountSearchText({ accountCode: null, accountName: null, suggestedCode: '5-2001', suggestedName: 'Beban Gaji' })).toBe('5-2001 Beban Gaji');
	expect(accountSearchText({ accountCode: null, accountName: null, suggestedCode: null, suggestedName: null })).toBe('');
});
