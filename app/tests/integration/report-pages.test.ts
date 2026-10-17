import { beforeEach, expect, test } from 'bun:test';
import { load as incomeLoad } from '../../src/routes/(app)/income-statement/+page.server';
import { load as trialLoad } from '../../src/routes/(app)/trial-balance/+page.server';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function viewerCtx() {
	const { companyId } = await makeCompany();
	const v = await makeUser();
	await addMember(v.id, companyId, 'viewer');
	return contextFor(v, companyId);
}

type Loaded = { rangeError: string | null; defaults: { from: string; to: string }; tb?: { from: string; to: string }; current?: { from: string; to: string } };

test.each([
	['trial balance', trialLoad, '/trial-balance'],
	['income statement', incomeLoad, '/income-statement']
] as const)('%s page falls back to the default range with a message when from is after to', async (_n, load, path) => {
	const ctx = await viewerCtx();
	const bad = (await load(fakeEvent({ ctx, path: `${path}?from=2026-02-01&to=2026-01-01` }) as never)) as unknown as Loaded;
	expect(bad.rangeError).toBe('Tanggal awal harus sebelum tanggal akhir');
	const shown = bad.tb ?? bad.current!;
	expect(shown).toMatchObject(bad.defaults);

	const ok = (await load(fakeEvent({ ctx, path: `${path}?from=2026-01-01&to=2026-01-31` }) as never)) as unknown as Loaded;
	expect(ok.rangeError).toBeNull();
	expect(ok.tb ?? ok.current!).toMatchObject({ from: '2026-01-01', to: '2026-01-31' });
});
