import { json } from '@sveltejs/kit';
import { cancelInvoice, getInvoice } from '$lib/server/invoicing/invoices';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { roleAtLeast } from '$lib/roles';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const viewerCtx = requireRole(event, 'viewer');
		const invoiceId = parseId(event.params.id, 'Invoice');
		const invoice = await getInvoice(viewerCtx.companyId, invoiceId);
		const ctx = requireRole(event, invoice.status === 'DRAFT' ? 'accountant' : 'admin');
		// Cek role di atas memakai status yang dibaca terpisah dan bisa basi; keputusan akhir diambil
		// service di bawah lock, berdasarkan role pemanggil yang sebenarnya.
		await cancelInvoice(ctx.companyId, ctx.user.id, invoiceId, { callerIsAdmin: roleAtLeast(ctx.role, 'admin') });
		return json({ ok: true });
	});
