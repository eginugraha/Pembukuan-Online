import { beforeAll, describe, expect, test } from 'bun:test';
import * as accounts from '../../src/routes/api/accounts/+server';
import * as accountOne from '../../src/routes/api/accounts/[id]/+server';
import * as accountDelete from '../../src/routes/api/accounts/[id]/delete/+server';
import * as accountUsage from '../../src/routes/api/accounts/[id]/usage/+server';
import * as companies from '../../src/routes/api/companies/+server';
import * as companyOne from '../../src/routes/api/companies/[id]/+server';
import * as journal from '../../src/routes/api/journal/+server';
import * as journalAccount from '../../src/routes/api/journal/[id]/account/+server';
import * as journalGenerate from '../../src/routes/api/journal/generate/+server';
import * as opening from '../../src/routes/api/opening-balance/+server';
import * as ledger from '../../src/routes/api/reports/ledger/+server';
import * as balanceSheet from '../../src/routes/api/reports/balance-sheet/+server';
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
import * as contactsApi from '../../src/routes/api/invoicing/contacts/+server';
import * as contactOne from '../../src/routes/api/invoicing/contacts/[id]/+server';
import * as invoicesApi from '../../src/routes/api/invoicing/invoices/+server';
import * as invoiceOne from '../../src/routes/api/invoicing/invoices/[id]/+server';
import * as invoiceSend from '../../src/routes/api/invoicing/invoices/[id]/send/+server';
import * as invoicePay from '../../src/routes/api/invoicing/invoices/[id]/pay/+server';
import * as invoiceCancel from '../../src/routes/api/invoicing/invoices/[id]/cancel/+server';
import * as invoicePdf from '../../src/routes/api/invoicing/invoices/[id]/pdf/+server';
import * as purchaseOrdersApi from '../../src/routes/api/invoicing/purchase-orders/+server';
import * as purchaseOrderOne from '../../src/routes/api/invoicing/purchase-orders/[id]/+server';
import * as purchaseOrderIssue from '../../src/routes/api/invoicing/purchase-orders/[id]/issue/+server';
import * as purchaseOrderReceive from '../../src/routes/api/invoicing/purchase-orders/[id]/receive/+server';
import * as purchaseOrderCancel from '../../src/routes/api/invoicing/purchase-orders/[id]/cancel/+server';
import * as purchaseOrderPdf from '../../src/routes/api/invoicing/purchase-orders/[id]/pdf/+server';
import { db } from '../../src/lib/server/db';
import { contacts as contactsTable } from '../../src/lib/server/db/schema';
import { createInvoice, sendInvoice } from '../../src/lib/server/invoicing/invoices';
import { createPurchaseOrder, issuePurchaseOrder, receivePurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import type { AppContext } from '../../src/lib/server/rbac';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

type Level = 'viewer' | 'accountant' | 'admin' | 'super';
type H = (e: never) => Response | Promise<Response>;
const RID = '00000000-0000-4000-8000-000000000000';

/**
 * Dokumen nyata untuk endpoint batal Invoice/PO, yang role minimumnya bergantung pada status
 * dokumen (Draft/Diterbitkan → accountant, Terkirim/Diterima → admin). Dengan id acak, route
 * menolak 404 sebelum sempat memutuskan role, jadi matrix-nya butuh dokumen sungguhan per status.
 * Diisi di beforeAll; `params` berupa fungsi supaya dibaca saat test berjalan.
 */
const docs = { draftInvoice: '', sentInvoice: '', issuedPO: '', receivedPO: '' };

const ENDPOINTS: Array<{ name: string; handler: H; method: string; min: Level; body?: unknown; form?: boolean; params?: Record<string, string> | (() => Record<string, string>) }> = [
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
	{ name: 'GET /accounts/:id/usage', handler: accountUsage.GET, method: 'GET', min: 'admin', params: { id: RID } },
	{ name: 'POST /accounts/:id/delete', handler: accountDelete.POST, method: 'POST', min: 'admin', params: { id: RID }, body: {} },
	{ name: 'GET /rules', handler: rules.GET, method: 'GET', min: 'viewer' },
	{ name: 'POST /rules', handler: rules.POST, method: 'POST', min: 'accountant', body: {} },
	{ name: 'DELETE /rules/:id', handler: ruleOne.DELETE, method: 'DELETE', min: 'admin', params: { id: RID } },
	{ name: 'POST /journal/generate', handler: journalGenerate.POST, method: 'POST', min: 'accountant', body: { uploadId: RID } },
	{ name: 'GET /journal', handler: journal.GET, method: 'GET', min: 'viewer' },
	{ name: 'PATCH /journal/:id/account', handler: journalAccount.PATCH, method: 'PATCH', min: 'accountant', params: { id: RID }, body: { accountId: RID } },
	{ name: 'GET /reports/ledger', handler: ledger.GET, method: 'GET', min: 'viewer' },
	{ name: 'GET /reports/trial-balance', handler: trialBalance.GET, method: 'GET', min: 'viewer' },
	{ name: 'GET /reports/balance-sheet', handler: balanceSheet.GET, method: 'GET', min: 'viewer' },
	{ name: 'GET /opening-balance', handler: opening.GET, method: 'GET', min: 'viewer' },
	{ name: 'PUT /opening-balance', handler: opening.PUT, method: 'PUT', min: 'accountant', body: {} },
	{ name: 'GET /users', handler: users.GET, method: 'GET', min: 'admin' },
	{ name: 'POST /users', handler: users.POST, method: 'POST', min: 'admin', body: {} },
	{ name: 'PATCH /users/:id/role', handler: userRole.PATCH, method: 'PATCH', min: 'admin', params: { id: RID }, body: { role: 'viewer' } },
	{ name: 'DELETE /users/:id', handler: userOne.DELETE, method: 'DELETE', min: 'admin', params: { id: RID } },
	{ name: 'PATCH /companies/:id', handler: companyOne.PATCH, method: 'PATCH', min: 'admin', params: { id: RID }, body: {} },
	{ name: 'POST /companies', handler: companies.POST, method: 'POST', min: 'super', body: {} },
	{ name: 'PATCH /users/:id/super-admin', handler: superAdmin.PATCH, method: 'PATCH', min: 'super', params: { id: RID }, body: { value: true } },
	// Invoicing: Kontak
	{ name: 'GET /invoicing/contacts', handler: contactsApi.GET, method: 'GET', min: 'viewer' },
	{ name: 'POST /invoicing/contacts', handler: contactsApi.POST, method: 'POST', min: 'accountant', body: {} },
	{ name: 'PUT /invoicing/contacts/:id', handler: contactOne.PUT, method: 'PUT', min: 'accountant', params: { id: RID }, body: {} },
	{ name: 'DELETE /invoicing/contacts/:id', handler: contactOne.DELETE, method: 'DELETE', min: 'accountant', params: { id: RID } },
	// Invoicing: Invoice
	{ name: 'GET /invoicing/invoices', handler: invoicesApi.GET, method: 'GET', min: 'viewer' },
	{ name: 'POST /invoicing/invoices', handler: invoicesApi.POST, method: 'POST', min: 'accountant', body: {} },
	{ name: 'GET /invoicing/invoices/:id', handler: invoiceOne.GET, method: 'GET', min: 'viewer', params: { id: RID } },
	{ name: 'GET /invoicing/invoices/:id/pdf', handler: invoicePdf.GET, method: 'GET', min: 'viewer', params: { id: RID } },
	{ name: 'POST /invoicing/invoices/:id/send', handler: invoiceSend.POST, method: 'POST', min: 'accountant', params: { id: RID }, body: { date: '2026-10-05' } },
	{ name: 'POST /invoicing/invoices/:id/pay', handler: invoicePay.POST, method: 'POST', min: 'accountant', params: { id: RID }, body: { date: '2026-10-05', method: 'BANK' } },
	{ name: 'POST /invoicing/invoices/:id/cancel (Draft)', handler: invoiceCancel.POST, method: 'POST', min: 'accountant', params: () => ({ id: docs.draftInvoice }) },
	{ name: 'POST /invoicing/invoices/:id/cancel (Terkirim)', handler: invoiceCancel.POST, method: 'POST', min: 'admin', params: () => ({ id: docs.sentInvoice }) },
	// Invoicing: Purchase Order
	{ name: 'GET /invoicing/purchase-orders', handler: purchaseOrdersApi.GET, method: 'GET', min: 'viewer' },
	{ name: 'POST /invoicing/purchase-orders', handler: purchaseOrdersApi.POST, method: 'POST', min: 'accountant', body: {} },
	{ name: 'GET /invoicing/purchase-orders/:id', handler: purchaseOrderOne.GET, method: 'GET', min: 'viewer', params: { id: RID } },
	{ name: 'GET /invoicing/purchase-orders/:id/pdf', handler: purchaseOrderPdf.GET, method: 'GET', min: 'viewer', params: { id: RID } },
	{ name: 'POST /invoicing/purchase-orders/:id/issue', handler: purchaseOrderIssue.POST, method: 'POST', min: 'accountant', params: { id: RID } },
	{ name: 'POST /invoicing/purchase-orders/:id/receive', handler: purchaseOrderReceive.POST, method: 'POST', min: 'accountant', params: { id: RID }, body: { date: '2026-10-15' } },
	{ name: 'POST /invoicing/purchase-orders/:id/cancel (Diterbitkan)', handler: purchaseOrderCancel.POST, method: 'POST', min: 'accountant', params: () => ({ id: docs.issuedPO }) },
	{ name: 'POST /invoicing/purchase-orders/:id/cancel (Diterima)', handler: purchaseOrderCancel.POST, method: 'POST', min: 'admin', params: () => ({ id: docs.receivedPO }) }
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

	const userId = ctxs.admin.user.id;
	const [contact] = await db.insert(contactsTable).values({ companyId, kind: 'BOTH', name: 'PT Matrix' }).returning();
	const invoiceInput = {
		contactId: contact.id,
		issueDate: '2026-10-01',
		receivableAccountId: await accountIdByCode(companyId, '1-1003'),
		lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000', revenueAccountId: await accountIdByCode(companyId, '4-1001') }]
	};
	docs.draftInvoice = (await createInvoice(companyId, userId, invoiceInput)).id;
	docs.sentInvoice = (await createInvoice(companyId, userId, invoiceInput)).id;
	await sendInvoice(companyId, userId, docs.sentInvoice, '2026-10-05');
	const poInput = {
		contactId: contact.id,
		issueDate: '2026-10-01',
		payableAccountId: await accountIdByCode(companyId, '2-1001'),
		lines: [{ description: 'Sewa', quantity: '1', unitPrice: '1000', expenseAccountId: await accountIdByCode(companyId, '5-2010') }]
	};
	docs.issuedPO = (await createPurchaseOrder(companyId, userId, poInput)).id;
	await issuePurchaseOrder(companyId, userId, docs.issuedPO);
	docs.receivedPO = (await createPurchaseOrder(companyId, userId, poInput)).id;
	await issuePurchaseOrder(companyId, userId, docs.receivedPO);
	await receivePurchaseOrder(companyId, userId, docs.receivedPO, '2026-10-15');
});

function event(ep: (typeof ENDPOINTS)[number], ctx: AppContext | null) {
	return fakeEvent({
		ctx,
		method: ep.method,
		params: typeof ep.params === 'function' ? ep.params() : ep.params,
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
