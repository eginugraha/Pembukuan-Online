import { expect, test } from 'bun:test';
import { UpdateCompanyInput } from '$lib/schemas/company';

test('company email accepts null like other optional fields', () => {
	const r = UpdateCompanyInput.safeParse({ name: 'PT Uji', email: null, code: 'UJI' });
	expect(r.success).toBe(true);
});
