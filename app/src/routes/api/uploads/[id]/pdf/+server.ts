import { apiHandler, notFound } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { readStatementPdf } from '$lib/server/uploads/pdf-store';
import { getUpload } from '$lib/server/uploads/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const upload = await getUpload(ctx.companyId, parseId(event.params.id, 'Upload'));
		const content = upload.hasPdf ? await readStatementPdf(ctx.companyId, upload.id) : null;
		if (!content) throw notFound('PDF');
		return new Response(new Blob([new Uint8Array(content)]), {
			headers: {
				'content-type': 'application/pdf',
				'content-disposition': `inline; filename="${upload.id}.pdf"`,
				'cache-control': 'private, no-store',
				'x-content-type-options': 'nosniff'
			}
		});
	});
