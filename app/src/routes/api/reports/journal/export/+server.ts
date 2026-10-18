import ExcelJS from 'exceljs';
import { z } from 'zod';
import { monthRange, todayIso } from '$lib/dates';
import { apiHandler } from '$lib/server/api';
import { toCsv } from '$lib/server/export/csv';
import { buildJournalRows } from '$lib/server/export/journal';
import { listJournal } from '$lib/server/journal/queries';
import { requireRole } from '$lib/server/rbac';
import { dateParam } from '$lib/server/validation';
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
		const month = monthRange(todayIso());
		const from = dateParam(event.url, 'from') ?? month.from;
		const to = dateParam(event.url, 'to') ?? month.to;

		const { entries } = await listJournal(ctx.companyId, from, to);
		const { headers, rows } = buildJournalRows(entries);

		let bytes: Uint8Array<ArrayBuffer>;
		if (format === 'xlsx') {
			const wb = new ExcelJS.Workbook();
			const ws = wb.addWorksheet('Jurnal');
			ws.addRow(headers);
			rows.forEach((r) => ws.addRow(r));
			bytes = new Uint8Array(await wb.xlsx.writeBuffer());
		} else {
			bytes = new TextEncoder().encode(toCsv(headers, rows));
		}

		const filename = `jurnal_${from}_${to}.${format}`;
		return new Response(bytes, {
			headers: {
				'content-type': MIME[format],
				'content-disposition': `attachment; filename="${filename}"`
			}
		});
	});
