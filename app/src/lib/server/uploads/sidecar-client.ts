import { ApiError } from '../api';
import { env } from '../env';

export interface ParsedTransaction {
	line_no: number;
	date: string;
	description: string;
	amount: string;
	direction: 'DB' | 'CR';
	balance: string | null;
}
export interface ParsedStatement {
	account_no: string;
	period_start: string;
	period_end: string;
	opening_balance: string;
	closing_balance: string;
	transactions: ParsedTransaction[];
}

const REASON_MESSAGES: Record<string, string> = {
	not_bca: 'File bukan eStatement BCA yang dikenali.',
	checksum_mismatch:
		'Total mutasi di PDF tidak cocok dengan ringkasan di bagian bawah. File mungkin rusak atau formatnya belum didukung.',
	unreadable: 'PDF tidak bisa dibaca.'
};

const unavailable = () =>
	new ApiError(503, 'sidecar_unavailable', 'Layanan parser PDF tidak tersedia. Coba lagi beberapa saat lagi.');

export async function parseWithSidecar(
	file: File,
	opts: { url?: string; fetch?: typeof fetch } = {}
): Promise<ParsedStatement> {
	const doFetch = opts.fetch ?? fetch;
	const form = new FormData();
	form.append('file', file, file.name);
	let res: Response;
	try {
		res = await doFetch(`${opts.url ?? env.SIDECAR_URL}/parse`, {
			method: 'POST',
			body: form,
			signal: AbortSignal.timeout(60_000)
		});
	} catch {
		throw unavailable();
	}
	if (res.status === 422) {
		const body = (await res.json().catch(() => ({}))) as { reason?: string; detail?: string };
		const reason = body.reason && REASON_MESSAGES[body.reason] ? body.reason : 'unreadable';
		throw new ApiError(422, `pdf_${reason}`, REASON_MESSAGES[reason], body.detail);
	}
	if (!res.ok) throw unavailable();
	return (await res.json()) as ParsedStatement;
}
