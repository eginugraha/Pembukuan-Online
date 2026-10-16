import { and, count, eq } from 'drizzle-orm';
import { minRoleForPath } from '$lib/nav';
import { roleAtLeast, type Role } from '$lib/roles';
import { db } from '../db';
import { journalEntries, transactions } from '../db/schema';

export interface NextStep {
	label: string;
	detail: string;
	href: string;
}

export async function pendingTransactionCount(companyId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(transactions)
		.where(and(eq(transactions.companyId, companyId), eq(transactions.isConfirmed, false)));
	return row.n;
}

export async function hasOpeningBalance(companyId: string): Promise<boolean> {
	const opening = await db.query.journalEntries.findFirst({
		columns: { id: true },
		where: and(eq(journalEntries.companyId, companyId), eq(journalEntries.type, 'OPENING'))
	});
	return !!opening;
}

/** Satu ajakan paling relevan untuk kartu "Langkah berikutnya" di sidebar, disaring sesuai role. */
export async function getNextStep(companyId: string, role: Role | null): Promise<NextStep | null> {
	const [opening, pending] = await Promise.all([hasOpeningBalance(companyId), pendingTransactionCount(companyId)]);
	const candidates: NextStep[] = [];
	if (!opening) candidates.push({ label: 'Atur Saldo Awal', detail: 'Isi saldo awal agar laporan keuangan akurat.', href: '/settings/opening-balance' });
	if (pending > 0) candidates.push({ label: `Review ${pending} transaksi`, detail: 'AI sudah menyarankan akunnya, tinggal dikonfirmasi.', href: '/review' });
	candidates.push({ label: 'Upload eStatement', detail: 'Unggah eStatement BCA terbaru untuk dibukukan.', href: '/uploads/new' });
	return candidates.find((c) => roleAtLeast(role, minRoleForPath(c.href) ?? 'admin')) ?? null;
}
