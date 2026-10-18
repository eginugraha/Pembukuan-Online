import ExcelJS from 'exceljs';
import { z } from 'zod';
import { monthRange, todayIso } from '$lib/dates';
import { apiHandler, ApiError } from '$lib/server/api';
import { toCsv } from '$lib/server/export/csv';
import { buildLedgerRows } from '$lib/server/export/ledger';
import { requireRole } from '$lib/server/rbac';
import { getLedger } from '$lib/server/reports/ledger';
import { dateParam, uuidSchema } from '$lib/server/validation';
import type { RequestHandler } from './$types';

const FormatParam = z.enum(['xlsx', 'csv']);

const MIME = {
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	csv: 'text/csv; charset=utf-8'
} as const;

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const format = FormatParam.parse(event.url.searchParams.get('format'));
		const accountParam = uuidSchema.safeParse(event.url.searchParams.get('account_id'));
		if (!accountParam.success) throw new ApiError(400, 'validation_error', 'Akun wajib dipilih');
		const month = monthRange(todayIso());
		const from = dateParam(event.url, 'from') ?? month.from;
		const to = dateParam(event.url, 'to') ?? month.to;

		const ledger = await getLedger(ctx.companyId, accountParam.data, from, to);
		const { headers, rows } = buildLedgerRows(ledger);

		let bytes: Uint8Array<ArrayBuffer>;
		if (format === 'xlsx') {
			const wb = new ExcelJS.Workbook();
			const ws = wb.addWorksheet('Buku Besar');
			ws.addRow(headers);
			rows.forEach((r) => ws.addRow(r));
			bytes = new Uint8Array(await wb.xlsx.writeBuffer());
		} else {
			bytes = new TextEncoder().encode(toCsv(headers, rows));
		}

		const filename = `buku-besar_${ledger.account.code}_${from}_${to}.${format}`;
		return new Response(bytes, {
			headers: {
				'content-type': MIME[format],
				'content-disposition': `attachment; filename="${filename}"`
			}
		});
	});
