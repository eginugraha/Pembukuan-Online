import { and, count, eq, ne } from 'drizzle-orm';
import { minRoleForPath } from '$lib/nav';
import { roleAtLeast, type Role } from '$lib/roles';
import { db } from '../db';
import { journalEntries, statementUploads, transactions } from '../db/schema';

export interface NextStep {
	label: string;
	detail: string;
	href: string;
}

/** Transaksi yang menunggu konfirmasi; upload yang masih diproses belum bisa direview jadi tidak dihitung. */
export async function pendingTransactionCount(companyId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(transactions)
		.innerJoin(statementUploads, eq(statementUploads.id, transactions.uploadId))
		.where(and(eq(transactions.companyId, companyId), eq(transactions.isConfirmed, false), ne(statementUploads.status, 'processing')));
	return row.n;
}

export interface ShellStats {
	pending: number;
	opening: boolean;
}

/** Statistik ringan yang dipakai layout (kartu langkah berikutnya) dan dashboard; dihitung sekali per permintaan. */
export async function getShellStats(companyId: string): Promise<ShellStats> {
	const [pending, opening] = await Promise.all([pendingTransactionCount(companyId), hasOpeningBalance(companyId)]);
	return { pending, opening };
}

export async function hasOpeningBalance(companyId: string): Promise<boolean> {
	const opening = await db.query.journalEntries.findFirst({
		columns: { id: true },
		where: and(eq(journalEntries.companyId, companyId), eq(journalEntries.type, 'OPENING'))
	});
	return !!opening;
}

/** Satu ajakan paling relevan untuk kartu "Langkah berikutnya" di sidebar, disaring sesuai role. */
export async function getNextStep(companyId: string, role: Role | null, stats?: ShellStats): Promise<NextStep | null> {
	const { opening, pending } = stats ?? (await getShellStats(companyId));
	const candidates: NextStep[] = [];
	if (!opening) candidates.push({ label: 'Atur Saldo Awal', detail: 'Isi saldo awal agar laporan keuangan akurat.', href: '/settings/opening-balance' });
	if (pending > 0) candidates.push({ label: `Review ${pending} transaksi`, detail: 'AI sudah menyarankan akunnya, tinggal dikonfirmasi.', href: '/review' });
	candidates.push({ label: 'Upload eStatement', detail: 'Unggah eStatement BCA terbaru untuk dibukukan.', href: '/uploads/new' });
	return candidates.find((c) => roleAtLeast(role, minRoleForPath(c.href) ?? 'admin')) ?? null;
}
