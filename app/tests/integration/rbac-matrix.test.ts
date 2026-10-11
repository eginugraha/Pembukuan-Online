import { beforeAll, describe, expect, test } from 'bun:test';
import * as accounts from '../../src/routes/api/accounts/+server';
import * as accountOne from '../../src/routes/api/accounts/[id]/+server';
import * as companies from '../../src/routes/api/companies/+server';
import * as companyOne from '../../src/routes/api/companies/[id]/+server';
import * as journal from '../../src/routes/api/journal/+server';
import * as journalGenerate from '../../src/routes/api/journal/generate/+server';
import * as opening from '../../src/routes/api/opening-balance/+server';
import * as ledger from '../../src/routes/api/reports/ledger/+server';
import * as trialBalance from '../../src/routes/api/reports/trial-balance/+server';
import * as rules from '../../src/routes/api/rules/+server';
import * as ruleOne from '../../src/routes/api/rules/[id]/+server';
import * as txns from '../../src/routes/api/transactions/+server';
import * as bulk from '../../src/routes/api/transactions/bulk-confirm/+server';
import * as confirm from '../../src/routes/api/transactions/[id]/confirm/+server';
import * as uploads from '../../src/routes/api/uploads/+server';
import * as uploadOne from '../../src/routes/api/uploads/[id]/+server';
import * as categorize from '../../src/routes/api/uploads/[id]/categorize/+server';
import * as users from '../../src/routes/api/users/+server';
import * as userOne from '../../src/routes/api/users/[id]/+server';
import * as userRole from '../../src/routes/api/users/[id]/role/+server';
import * as superAdmin from '../../src/routes/api/users/[id]/super-admin/+server';
import type { AppContext } from '../../src/lib/server/rbac';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

type Level = 'viewer' | 'accountant' | 'admin' | 'super';
type H = (e: never) => Response | Promise<Response>;
const RID = '00000000-0000-4000-8000-000000000000';

const ENDPOINTS: Array<{ name: string; handler: H; method: string; min: Level; body?: unknown; form?: boolean; params?: Record<string, string> }> = [
	{ name: 'GET /uploads', handler: uploads.GET, method: 'GET', min: 'viewer' },
	{ name: 'POST /uploads', handler: uploads.POST, method: 'POST', min: 'accountant', form: true },
	{ name: 'GET /uploads/:id', handler: uploadOne.GET, method: 'GET', min: 'viewer', params: { id: RID } },
	{ name: 'DELETE /uploads/:id', handler: uploadOne.DELETE, method: 'DELETE', min: 'admin', params: { id: RID } },
	{ name: 'POST /uploads/:id/categorize', handler: categorize.POST, method: 'POST', min: 'accountant', params: { id: RID } },
	{ name: 'GET /transactions', handler: txns.GET, method: 'GET', min: 'viewer' },
	{ name: 'PATCH /transactions/:id/confirm', handler: confirm.PATCH, method: 'PATCH', min: 'accountant', params: { id: RID }, body: { accountId: RID } },
	{ name: 'POST /transactions/bulk-confirm', handler: bulk.POST, method: 'POST', min: 'accountant', body: { uploadId: RID } },
	{ name: 'GET /accounts', handler: accounts.GET, method: 'GET', min: 'viewer' },
	{ name: 'POST /accounts', handler: accounts.POST, method: 'POST', min: 'accountant', body: {} },
	{ name: 'PATCH /accounts/:id', handler: accountOne.PATCH, method: 'PATCH', min: 'admin', params: { id: RID }, body: {} },
	{ name: 'DELETE /accounts/:id', handler: accountOne.DELETE, method: 'DELETE', min: 'admin', params: { id: RID } },
	{ name: 'GET /rules', handler: rules.GET, method: 'GET', min: 'viewer' },
	{ name: 'POST /rules', handler: rules.POST, method: 'POST', min: 'accountant', body: {} },
	{ name: 'DELETE /rules/:id', handler: ruleOne.DELETE, method: 'DELETE', min: 'admin', params: { id: RID } },
	{ name: 'POST /journal/generate', handler: journalGenerate.POST, method: 'POST', min: 'accountant', body: { uploadId: RID } },
	{ name: 'GET /journal', handler: journal.GET, method: 'GET', min: 'viewer' },
	{ name: 'GET /reports/ledger', handler: ledger.GET, method: 'GET', min: 'viewer' },
	{ name: 'GET /reports/trial-balance', handler: trialBalance.GET, method: 'GET', min: 'viewer' },
	{ name: 'GET /opening-balance', handler: opening.GET, method: 'GET', min: 'viewer' },
	{ name: 'PUT /opening-balance', handler: opening.PUT, method: 'PUT', min: 'accountant', body: {} },
	{ name: 'GET /users', handler: users.GET, method: 'GET', min: 'admin' },
	{ name: 'POST /users', handler: users.POST, method: 'POST', min: 'admin', body: {} },
	{ name: 'PATCH /users/:id/role', handler: userRole.PATCH, method: 'PATCH', min: 'admin', params: { id: RID }, body: { role: 'viewer' } },
	{ name: 'DELETE /users/:id', handler: userOne.DELETE, method: 'DELETE', min: 'admin', params: { id: RID } },
	{ name: 'PATCH /companies/:id', handler: companyOne.PATCH, method: 'PATCH', min: 'admin', params: { id: RID }, body: {} },
	{ name: 'POST /companies', handler: companies.POST, method: 'POST', min: 'super', body: {} },
	{ name: 'PATCH /users/:id/super-admin', handler: superAdmin.PATCH, method: 'PATCH', min: 'super', params: { id: RID }, body: { value: true } }
];

const ORDER: Level[] = ['viewer', 'accountant', 'admin', 'super'];
const ctxs = {} as Record<Level, AppContext>;

beforeAll(async () => {
	await resetDb();
	const { companyId } = await makeCompany();
	for (const level of ['viewer', 'accountant', 'admin'] as const) {
		const u = await makeUser();
		await addMember(u.id, companyId, level);
		ctxs[level] = await contextFor(u);
	}
	ctxs.super = await contextFor(await makeUser({ isSuperAdmin: true }));
});

function event(ep: (typeof ENDPOINTS)[number], ctx: AppContext | null) {
	return fakeEvent({
		ctx,
		method: ep.method,
		params: ep.params,
		body: ep.form ? undefined : ep.body,
		form: ep.form ? new FormData() : undefined,
		path: '/api/x'
	});
}

describe('RBAC matrix', () => {
	for (const ep of ENDPOINTS) {
		test(ep.name, async () => {
			expect((await call(ep.handler, event(ep, null))).status).toBe(401);
			for (const level of ORDER) {
				const { status } = await call(ep.handler, event(ep, ctxs[level]));
				const allowed = ORDER.indexOf(level) >= ORDER.indexOf(ep.min);
				if (allowed) expect({ level, status }).not.toEqual({ level, status: 403 });
				else expect({ level, status }).toEqual({ level, status: 403 });
			}
		});
	}
});
