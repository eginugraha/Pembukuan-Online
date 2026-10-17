import { beforeEach, expect, test } from 'bun:test';
import { listTransactions } from '../../src/lib/server/transactions/queries';
import { getShellStats } from '../../src/lib/server/dashboard/next-step';
import { makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('the dashboard/sidebar pending count equals what the Review page lists, for every upload status', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await makeUpload(companyId, u.id, [{ description: 'DIPROSES', debit: '1' }, { description: 'DIPROSES 2', debit: '1' }], { accountNo: 'P', status: 'processing' });
	await makeUpload(companyId, u.id, [{ description: 'REVIEW', debit: '2' }], { accountNo: 'R', status: 'review' });
	await makeUpload(companyId, u.id, [{ description: 'ERROR', debit: '3' }], { accountNo: 'E', status: 'error' });
	await makeUpload(companyId, u.id, [{ description: 'SELESAI', debit: '4' }], { accountNo: 'D', status: 'done' });

	const listed = await listTransactions(companyId, { pendingOnly: true });
	expect(listed.map((t) => t.description).sort()).toEqual(['ERROR', 'REVIEW', 'SELESAI']);
	expect((await getShellStats(companyId)).pending).toBe(listed.length);
});
