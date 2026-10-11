import { eq } from 'drizzle-orm';
import { runCategorization, type SuggestFn } from './categorize/pipeline';
import { suggestAccounts } from './categorize/ollama';
import { db } from './db';
import { statementUploads } from './db/schema';
import { env } from './env';
import { markUploadError } from './uploads/status';

let suggest: SuggestFn = (groups, accounts) =>
	suggestAccounts(groups, accounts, { url: env.OLLAMA_URL, model: env.OLLAMA_MODEL });

const queue: string[] = [];
let running: Promise<void> | null = null;

export function configureJobs(opts: { suggest: SuggestFn }): void {
	suggest = opts.suggest;
}

async function drain(): Promise<void> {
	while (queue.length > 0) {
		const uploadId = queue.shift()!;
		try {
			await runCategorization(uploadId, suggest);
		} catch (e) {
			console.error(`Kategorisasi upload ${uploadId} gagal`, e);
			await markUploadError(db, uploadId, e instanceof Error ? e.message : String(e));
		}
	}
}

/** Antrian in-process, diproses serial. Duplikat diabaikan. */
export function enqueueCategorization(uploadId: string): void {
	if (!queue.includes(uploadId)) queue.push(uploadId);
	running ??= drain().finally(() => {
		running = null;
	});
}

export async function jobsIdle(): Promise<void> {
	while (running) await running;
}

/** Dipanggil saat server start: lanjutkan upload yang terhenti di status processing. */
export async function resumePendingJobs(): Promise<number> {
	const rows = await db
		.select({ id: statementUploads.id })
		.from(statementUploads)
		.where(eq(statementUploads.status, 'processing'));
	for (const r of rows) enqueueCategorization(r.id);
	return rows.length;
}
