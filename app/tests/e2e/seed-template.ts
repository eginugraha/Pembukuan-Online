import { client } from '../../src/lib/server/db';
import { addMember, makeCompany, makeUser } from '../integration/factory';
import { E2E_PASSWORD, E2E_TEMPLATE_EMAIL } from '../../playwright.config';

// User + perusahaan khusus (template Umum) untuk change-template.spec.ts: spec itu mengganti CoA,
// jadi tidak boleh menyentuh perusahaan admin yang dipakai spec lain secara paralel.
const { companyId } = await makeCompany('ZZ Template E2E');
const user = await makeUser({ email: E2E_TEMPLATE_EMAIL, name: 'Template E2E', password: E2E_PASSWORD });
await addMember(user.id, companyId, 'admin');
await client.end();
