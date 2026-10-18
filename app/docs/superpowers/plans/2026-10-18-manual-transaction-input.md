# Manual Transaction Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second data-entry path — manual, row-by-row transaction input — alongside the existing BCA eStatement PDF upload, feeding the exact same categorization/review/journal pipeline, for companies whose bank account isn't BCA.

**Architecture:** A new Zod schema (`ManualEntryInput`) validates a bank name, account number, optional opening balance, and an array of transaction rows. A new service function (`createManualEntry`) builds a `ParsedStatement`-shaped object from those rows (computing period, running balance, and closing balance) and feeds it into logic extracted from the existing `createUpload`, so duplicate detection, DB insert, and categorization enqueue are shared code, not a parallel implementation. A new route (`POST /api/uploads/manual`) exposes it, and a new tab on `/uploads/new` is the entry point. Separately, the pre-existing `refNo` bug (hardcoded `BCA-` prefix, and a `maxRefSeq` substring offset that only works for a 3-letter prefix) is fixed for all journal entries, not just manual ones.

**Tech Stack:** SvelteKit + Svelte 5 runes, Drizzle ORM/Postgres, Zod, bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-manual-transaction-input-design.md`

## Global Constraints

- No DB migration: `statement_uploads.bank` is already `varchar(20)` free text, default `'BCA'`.
- No new dependencies.
- Create a batch: role `accountant` or above (`requireRole(event, 'accountant')`), same as PDF upload. View: role `viewer` or above — automatic, since manual batches use the same `statement_uploads`/`transactions` tables.
- Field validation is at least as strict as `OpeningInput`'s (reuse `$lib/schemas/common.ts` helpers: `requiredText`, `moneyString`, `isoDate`), with Indonesian error messages consistent with existing schemas.
- `refNo` for every *new* journal entry (PDF-derived or manual) becomes `` `JE-${yyyymm}-${seq.toString().padStart(4,'0')}` ``, one sequence per company per month (not per bank). Historical `BCA-...` refs are untouched and must not be renumbered or counted into the new sequence.
- No per-row edit endpoint after a batch is saved. Corrections happen via the existing `DELETE /api/uploads/[id]` (role `admin`) plus re-entry — this plan adds no new delete/edit routes.
- No CSV/bulk import — one row at a time via form, matching the existing PDF-upload mental model (same page, a second tab).
- The existing PDF upload flow, duplicate detection, categorization pipeline, and review/confirm UI are unchanged except for the `refNo` fix.

## Review Focus

- Rows entered out of chronological order — period (`period_start`/`period_end`) and the running `balance` column must be computed by **date** order, not input order. → Task 3's "unsorted input rows" test.
- A transaction row with amount `"0"` or `"0.00"` — `moneyString`'s regex alone accepts zero; must be rejected. → Task 2's schema test.
- A historical `BCA-yyyymm-NNNN` journal entry coexisting with new `JE-yyyymm-NNNN` entries for the same company/month — the new counter must start at `0001` and must not touch or get confused by the old row. → Task 1's test.
- Wrong role (`viewer`) or wrong company hitting `POST /api/uploads/manual` — must be rejected the same way the PDF route rejects it. → Task 4's route tests.
- A manual batch's account+period overlapping an *existing PDF upload's* period (and vice versa) — duplicate detection must apply across both paths, not just within one. → Task 3's duplicate test.

---

## Task 1: Fix `refNo` generation (bank-independent, for all uploads)

**Files:**
- Modify: `src/lib/server/journal/generate.ts:9-15,80` (`maxRefSeq`, the `refNo:` line in `generateJournal`)
- Test: `tests/integration/journal.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no interface change — `generateJournal(companyId, uploadId, userId)` keeps its signature and return type `{ created: number }`. Later tasks do not depend on this task's internals, only on the fact that `generateJournal` keeps working.

- [ ] **Step 1: Update the existing test's expected ref strings**

In `tests/integration/journal.test.ts`, the test `'creates balanced entries with sequential refs ordered by date'` currently asserts:

```ts
expect(entries.map((e) => [e.refNo, e.entryDate])).toEqual([
	['BCA-202608-0001', '2026-08-02'],
	['BCA-202608-0002', '2026-08-03'],
	['BCA-202608-0003', '2026-08-05']
]);
```

Change the three `BCA-` prefixes to `JE-` (keep everything else identical):

```ts
expect(entries.map((e) => [e.refNo, e.entryDate])).toEqual([
	['JE-202608-0001', '2026-08-02'],
	['JE-202608-0002', '2026-08-03'],
	['JE-202608-0003', '2026-08-05']
]);
```

- [ ] **Step 2: Run the test suite to confirm this test now fails against current code**

Run: `bun test tests/integration/journal.test.ts`
Expected: FAIL on the renamed test — actual values are still `BCA-...`.

- [ ] **Step 3: Add a new test for historical-ref coexistence**

Add to `tests/integration/journal.test.ts`, after the existing sequential-refs test:

```ts
test('a historical BCA- ref does not block or get counted into the new JE- sequence', async () => {
	const { companyId, u, uploadId } = await confirmedUpload();
	await db.insert(journalEntries).values({
		companyId,
		type: 'TRANSACTION',
		entryDate: '2026-08-01',
		refNo: 'BCA-202608-0007',
		createdBy: u.id
	});
	await generateJournal(companyId, uploadId, u.id);
	const refs = (await db.select({ refNo: journalEntries.refNo }).from(journalEntries).where(eq(journalEntries.companyId, companyId))).map((r) => r.refNo);
	expect(refs).toContain('BCA-202608-0007');
	expect(refs).toEqual(expect.arrayContaining(['JE-202608-0001', 'JE-202608-0002', 'JE-202608-0003']));
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `bun test tests/integration/journal.test.ts`
Expected: FAIL — new entries still get `BCA-...` refs (actual output won't contain the expected `JE-...` strings).

- [ ] **Step 5: Implement the fix in `src/lib/server/journal/generate.ts`**

In `maxRefSeq` (lines 9-15), change the `like` pattern from `` `BCA-${yyyymm}-%` `` to `` `JE-${yyyymm}-%` ``, and change `substring(${journalEntries.refNo} from 12)` to `substring(${journalEntries.refNo} from 11)` (the fixed prefix `JE-yyyymm-` is 10 characters, so the number starts at position 11).

In `generateJournal` (the `refNo:` line, currently line 80), change `` `BCA-${yyyymm}-${String(seq).padStart(4, '0')}` `` to `` `JE-${yyyymm}-${String(seq).padStart(4, '0')}` ``.

- [ ] **Step 6: Run both tests to verify they pass**

Run: `bun test tests/integration/journal.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 7: Run the full suite to check for other hardcoded `BCA-` expectations**

Run: `bun test tests/unit tests/integration`
Expected: PASS. If any other test elsewhere asserts a literal `BCA-...` refNo string, update it the same way (rename only, no behavior change) as part of this step.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/journal/generate.ts tests/integration/journal.test.ts
git commit -m "fix(app): generate bank-independent JE- journal refNo instead of hardcoded BCA-"
```

---

## Task 2: `ManualEntryInput` schema

**Files:**
- Create: `src/lib/schemas/upload.ts`
- Modify: `tests/unit/schemas.test.ts` (add import + one test)

**Interfaces:**
- Consumes: `requiredText`, `moneyString`, `isoDate` from `$lib/schemas/common` (existing).
- Produces: `ManualEntryInput` (Zod schema) and its inferred type `ManualEntryInput`, both exported from `$lib/schemas/upload.ts`, shaped as:
  ```ts
  { bank: string; accountNo: string; openingBalance?: string; rows: { date: string; description: string; direction: 'DB' | 'CR'; amount: string }[] }
  ```
  Task 3 (`createManualEntry`'s input type) and Task 4 (the API route) both consume this exact shape.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/schemas.test.ts`:

```ts
import { ManualEntryInput } from '$lib/schemas/upload';

test('manual entry: required fields, and a row amount of zero is rejected', () => {
	// `rows: []` (not omitted) so the array's own `.min(1)` message fires, not Zod's
	// default "expected array, received undefined" for a missing key.
	expect(fieldErrors(ManualEntryInput, { bank: '', accountNo: '', rows: [] })).toMatchObject({
		bank: 'Nama bank wajib diisi',
		accountNo: 'Nomor rekening wajib diisi',
		rows: 'Isi minimal satu baris transaksi'
	});
	const valid = { bank: 'Mandiri', accountNo: '123', rows: [{ date: '2026-08-01', description: 'Transfer', direction: 'DB', amount: '10000' }] };
	expect(fieldErrors(ManualEntryInput, valid)).toEqual({});
	const zero = { ...valid, rows: [{ ...valid.rows[0], amount: '0' }] };
	expect(fieldErrors(ManualEntryInput, zero).rows).toBe('Jumlah harus lebih dari 0');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/schemas.test.ts`
Expected: FAIL — `Cannot find module '$lib/schemas/upload'` (module doesn't exist yet).

- [ ] **Step 3: Implement `src/lib/schemas/upload.ts`**

```ts
import { z } from 'zod';
import { isoDate, moneyString, requiredText } from './common';

const positiveAmount = moneyString.refine((v) => Number(v) > 0, 'Jumlah harus lebih dari 0');

export const ManualEntryInput = z.object({
	bank: requiredText('Nama bank', 20),
	accountNo: requiredText('Nomor rekening', 30),
	openingBalance: moneyString.optional(),
	rows: z
		.array(
			z.object({
				date: isoDate,
				description: requiredText('Keterangan', 200),
				direction: z.enum(['DB', 'CR']),
				amount: positiveAmount
			})
		)
		.min(1, 'Isi minimal satu baris transaksi')
});
export type ManualEntryInput = z.infer<typeof ManualEntryInput>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/upload.ts tests/unit/schemas.test.ts
git commit -m "feat(app): add ManualEntryInput schema for manual transaction entry"
```

---

## Task 3: `createManualEntry` service function (shared insert logic with `createUpload`)

**Files:**
- Modify: `src/lib/server/uploads/service.ts`
- Test: Create `tests/integration/manual-entry.test.ts`

**Interfaces:**
- Consumes: `ManualEntryInput`'s row shape from Task 2 (`{ date, description, direction: 'DB' | 'CR', amount }` — this task defines its own `ManualRow` type with the same shape rather than importing Task 2's type, since the service layer doesn't depend on the schema layer elsewhere in this codebase either). `balanceAtStartOf(ex, companyId, accountId, date)` (existing, from `../ledger/balance`). `openingBalanceWarning`, `normalizeAccountNo` (existing, private/exported respectively in this same file).
- Produces:
  ```ts
  export interface ManualRow { date: string; description: string; direction: 'DB' | 'CR'; amount: string }
  export async function createManualEntry(
  	input: { companyId: string; userId: string; bank: string; accountNo: string; openingBalance?: string; rows: ManualRow[] },
  	deps: { enqueue: (uploadId: string) => void }
  ): Promise<{ id: string; balanceWarning: string | null }>
  ```
  Task 4's route calls this directly with its exact signature.

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/manual-entry.test.ts`:

```ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { statementUploads, transactions } from '../../src/lib/server/db/schema';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { createManualEntry, createUpload, type UploadDeps } from '../../src/lib/server/uploads/service';
import type { ParsedStatement } from '../../src/lib/server/uploads/sidecar-client';
import { accountIdByCode, makeCompany, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

function manualDeps() {
	const enqueued: string[] = [];
	return { deps: { enqueue: (id: string) => enqueued.push(id) }, enqueued };
}

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('computes period, running balance, filename and enqueues, from unsorted rows', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { deps, enqueued } = manualDeps();
	const res = await createManualEntry(
		{
			companyId,
			userId: u.id,
			bank: 'Mandiri',
			accountNo: '999-1',
			rows: [
				{ date: '2026-08-05', description: 'Transfer keluar', direction: 'DB', amount: '50000' },
				{ date: '2026-08-02', description: 'Transfer masuk', direction: 'CR', amount: '200000' }
			]
		},
		deps
	);
	expect(enqueued).toEqual([res.id]);
	expect(res.balanceWarning).toBeNull();
	const upload = await db.query.statementUploads.findFirst({ where: eq(statementUploads.id, res.id) });
	expect(upload).toMatchObject({
		bank: 'Mandiri',
		accountNo: '9991',
		periodStart: '2026-08-02',
		periodEnd: '2026-08-05',
		openingBalance: '0.00',
		closingBalance: '150000.00',
		filename: 'Input manual — 2026-08-02 s/d 2026-08-05'
	});
	const rows = await db.select().from(transactions).where(eq(transactions.uploadId, res.id)).orderBy(transactions.lineNo);
	expect(rows.map((r) => ({ date: r.txnDate, balance: r.balance }))).toEqual([
		{ date: '2026-08-02', balance: '200000.00' },
		{ date: '2026-08-05', balance: '150000.00' }
	]);
});

test('defaults opening balance to the book balance at period start when omitted', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '900000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '900000' }
		]
	});
	const { deps } = manualDeps();
	const res = await createManualEntry(
		{ companyId, userId: u.id, bank: 'BRI', accountNo: '1', rows: [{ date: '2026-08-10', description: 'X', direction: 'CR', amount: '1000' }] },
		deps
	);
	expect(res.balanceWarning).toBeNull();
	const upload = await db.query.statementUploads.findFirst({ where: eq(statementUploads.id, res.id) });
	expect(upload).toMatchObject({ openingBalance: '900000.00', closingBalance: '901000.00' });
});

test('an explicit opening balance that differs from the book balance warns, like the PDF path', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '900000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '900000' }
		]
	});
	const { deps } = manualDeps();
	const res = await createManualEntry(
		{ companyId, userId: u.id, bank: 'BRI', accountNo: '1', openingBalance: '100000', rows: [{ date: '2026-08-10', description: 'X', direction: 'CR', amount: '1000' }] },
		deps
	);
	expect(res.balanceWarning).toContain('900.000,00');
});

test('duplicate detection applies across manual and PDF paths for the same account+period', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { deps } = manualDeps();
	await createManualEntry(
		{ companyId, userId: u.id, bank: 'BRI', accountNo: '555', rows: [{ date: '2026-08-10', description: 'X', direction: 'CR', amount: '1000' }] },
		deps
	);
	const pdfDeps: UploadDeps = {
		parse: async () =>
			({
				account_no: '555',
				period_start: '2026-08-05',
				period_end: '2026-08-15',
				opening_balance: '0',
				closing_balance: '0',
				transactions: []
			}) satisfies ParsedStatement,
		enqueue: () => {}
	};
	const pdf = new File([new TextEncoder().encode('%PDF-1.4 fake')], 'st.pdf', { type: 'application/pdf' });
	expect(await codeOf(createUpload({ companyId, userId: u.id, file: pdf }, pdfDeps))).toBe('duplicate_statement');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/integration/manual-entry.test.ts`
Expected: FAIL — `createManualEntry` is not exported from `src/lib/server/uploads/service.ts`.

- [ ] **Step 3: Extract the shared insert logic in `src/lib/server/uploads/service.ts`**

Add `toMoney` to the existing `import { D, formatIdr } from '../../money';` line (→ `import { D, formatIdr, toMoney } from '../../money';`).

Extract lines 57-113 of the current `createUpload` (the `db.transaction(...)` block through `deps.enqueue(id); return { id, balanceWarning };`) into a new private function:

```ts
async function insertAndEnqueue(
	company: { id: string },
	meta: { userId: string; filename: string; bank: string },
	parsed: ParsedStatement,
	accountNo: string,
	balanceWarning: string | null,
	enqueue: (uploadId: string) => void
): Promise<{ id: string; balanceWarning: string | null }>
```

Body: the same transaction logic as today, with two changes: the `.insert(statementUploads).values({...})` call gets an added `bank: meta.bank` field, and `filename: input.file.name` becomes `filename: meta.filename`. At the end, instead of `deps.enqueue(id); return { id, balanceWarning };`, do `enqueue(id); return { id, balanceWarning };` (the parameter is now named `enqueue`, not `deps.enqueue`).

Rewrite `createUpload` to call it:

```ts
export async function createUpload(
	input: { companyId: string; userId: string; file: File },
	deps: UploadDeps
): Promise<{ id: string; balanceWarning: string | null }> {
	await validateFile(input.file);
	const company = await db.query.companies.findFirst({ where: eq(companies.id, input.companyId) });
	if (!company) throw notFound('Perusahaan');
	const parsed = await deps.parse(input.file);
	const accountNo = normalizeAccountNo(parsed.account_no);
	const balanceWarning = await openingBalanceWarning(company, parsed);
	return insertAndEnqueue(company, { userId: input.userId, filename: input.file.name, bank: 'BCA' }, parsed, accountNo, balanceWarning, deps.enqueue);
}
```

- [ ] **Step 4: Run the existing upload tests to verify the refactor is behavior-preserving**

Run: `bun test tests/integration/uploads.test.ts`
Expected: PASS, all pre-existing tests green with no changes to that file.

- [ ] **Step 5: Implement `createManualEntry`**

```ts
export interface ManualRow {
	date: string;
	description: string;
	direction: 'DB' | 'CR';
	amount: string;
}

export async function createManualEntry(
	input: { companyId: string; userId: string; bank: string; accountNo: string; openingBalance?: string; rows: ManualRow[] },
	deps: { enqueue: (uploadId: string) => void }
): Promise<{ id: string; balanceWarning: string | null }> {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, input.companyId) });
	if (!company) throw notFound('Perusahaan');
	const accountNo = normalizeAccountNo(input.accountNo);

	const sorted = input.rows
		.map((r, i) => ({ r, i }))
		.sort((a, b) => a.r.date.localeCompare(b.r.date) || a.i - b.i)
		.map(({ r }) => r);

	const opening = input.openingBalance ?? (company.bankAccountId ? await balanceAtStartOf(db, company.id, company.bankAccountId, sorted[0].date) : '0');

	let running = D(opening);
	const parsedTransactions = sorted.map((r, idx) => {
		running = r.direction === 'CR' ? running.plus(r.amount) : running.minus(r.amount);
		return { line_no: idx + 1, date: r.date, description: r.description, amount: toMoney(r.amount), direction: r.direction, balance: toMoney(running) };
	});

	const parsed: ParsedStatement = {
		account_no: accountNo,
		period_start: sorted[0].date,
		period_end: sorted[sorted.length - 1].date,
		opening_balance: toMoney(opening),
		closing_balance: toMoney(running),
		transactions: parsedTransactions
	};

	const balanceWarning = await openingBalanceWarning(company, parsed);
	const filename = `Input manual — ${parsed.period_start} s/d ${parsed.period_end}`;
	return insertAndEnqueue(company, { userId: input.userId, filename, bank: input.bank }, parsed, accountNo, balanceWarning, deps.enqueue);
}
```

Add `balanceAtStartOf` to the existing import from `'../ledger/balance'` (already imports it — no change needed there).

This function assumes `input.rows.length >= 1`, the same precondition `ManualEntryInput` enforces at the API boundary (Task 4); it is not re-validated here, matching how `createUpload` trusts `deps.parse`'s output shape.

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `bun test tests/integration/manual-entry.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/uploads/service.ts tests/integration/manual-entry.test.ts
git commit -m "feat(app): add createManualEntry, sharing insert/dedupe/enqueue logic with createUpload"
```

---

## Task 4: `POST /api/uploads/manual` route

**Files:**
- Create: `src/routes/api/uploads/manual/+server.ts`
- Test: Modify `tests/integration/manual-entry.test.ts`

**Interfaces:**
- Consumes: `ManualEntryInput` (Task 2), `createManualEntry` (Task 3), `requireRole` and `apiHandler`/`parseJson` (existing, from `$lib/server/rbac` and `$lib/server/api`), `enqueueCategorization` (existing, from `$lib/server/jobs`).
- Produces: `POST /api/uploads/manual` — body is `ManualEntryInput`'s JSON shape, success response `{ id: string; balanceWarning: string | null }` with status 201. Task 5's client calls this route by path.

- [ ] **Step 1: Write the failing tests**

Add to `tests/integration/manual-entry.test.ts` (add `import { POST } from '../../src/routes/api/uploads/manual/+server';`, `import { addMember, contextFor } from './factory';`, and `import { call, fakeEvent } from './event';` to the top):

```ts
test('route: accountant can create, viewer cannot, invalid body reports Indonesian field errors', async () => {
	const { companyId } = await makeCompany();
	const accountant = await makeUser();
	await addMember(accountant.id, companyId, 'accountant');
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');

	const body = { bank: 'Mandiri', accountNo: '1', rows: [{ date: '2026-08-10', description: 'X', direction: 'CR', amount: '1000' }] };

	const forbidden = await call(POST, fakeEvent({ ctx: await contextFor(viewer, companyId), method: 'POST', body }));
	expect(forbidden.status).toBe(403);

	const ok = await call(POST, fakeEvent({ ctx: await contextFor(accountant, companyId), method: 'POST', body }));
	expect(ok.status).toBe(201);
	expect(ok.body.id).toBeString();

	const invalid = await call(POST, fakeEvent({ ctx: await contextFor(accountant, companyId), method: 'POST', body: { bank: '', accountNo: '', rows: [] } }));
	expect(invalid.status).toBe(400);
	expect(invalid.body.error.fields).toMatchObject({ bank: 'Nama bank wajib diisi', accountNo: 'Nomor rekening wajib diisi', rows: 'Isi minimal satu baris transaksi' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/integration/manual-entry.test.ts`
Expected: FAIL — cannot resolve `../../src/routes/api/uploads/manual/+server` (route doesn't exist yet).

- [ ] **Step 3: Implement `src/routes/api/uploads/manual/+server.ts`**

```ts
import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { enqueueCategorization } from '$lib/server/jobs';
import { requireRole } from '$lib/server/rbac';
import { ManualEntryInput } from '$lib/schemas/upload';
import { createManualEntry } from '$lib/server/uploads/service';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, ManualEntryInput);
		const result = await createManualEntry({ companyId: ctx.companyId, userId: ctx.user.id, ...input }, { enqueue: enqueueCategorization });
		return json(result, { status: 201 });
	});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/integration/manual-entry.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api/uploads/manual/+server.ts tests/integration/manual-entry.test.ts
git commit -m "feat(app): add POST /api/uploads/manual route"
```

---

## Task 5: "Input Manual" tab on `/uploads/new`

**Files:**
- Modify: `src/routes/(app)/uploads/new/+page.svelte`
- Test: Create `tests/e2e/manual-entry.spec.ts`

**Interfaces:**
- Consumes: `POST /api/uploads/manual` (Task 4), `ManualEntryInput`/`fieldErrors` (Tasks 2, existing `$lib/forms/validation`), `apiFetch`/`ClientApiError` (existing `$lib/api-client`), `DateField` (existing `$lib/components/DateField.svelte`), `FormField` (existing `$lib/components/FormField.svelte`), `inputClass` (existing `$lib/ui`).
- Produces: nothing consumed by a later task — this is the last task.

- [ ] **Step 1: Add tab state and a row-array form, reusing the page's existing structure**

In `src/routes/(app)/uploads/new/+page.svelte`, add local state for the active tab and the manual form, following the inline-editable-table pattern already used in `src/routes/(app)/settings/opening-balance/+page.svelte` (per-row inputs editable/removable at any time before submit — this satisfies the spec's "catch typos before saving" requirement without a separate preview step):

```ts
type ManualRow = { date: string; description: string; direction: 'DB' | 'CR'; amount: string };

let activeTab = $state<'pdf' | 'manual'>('pdf');
let manualBank = $state('');
let manualAccountNo = $state('');
let manualOpeningBalance = $state('');
let manualRows = $state<ManualRow[]>([{ date: '', description: '', direction: 'DB', amount: '' }]);
let manualErrorMessage = $state<string | null>(null);
let manualBusy = $state(false);

function addManualRow() {
	manualRows = [...manualRows, { date: '', description: '', direction: 'DB', amount: '' }];
}
function removeManualRow(i: number) {
	manualRows = manualRows.filter((_, idx) => idx !== i);
}

const manualErrors = $derived(
	fieldErrors(ManualEntryInput, {
		bank: manualBank,
		accountNo: manualAccountNo,
		openingBalance: manualOpeningBalance || undefined,
		rows: manualRows
	})
);

async function submitManual(e: SubmitEvent) {
	e.preventDefault();
	manualErrorMessage = null;
	if (Object.keys(manualErrors).length > 0) {
		manualErrorMessage = Object.values(manualErrors)[0];
		return;
	}
	manualBusy = true;
	try {
		const res = await apiFetch<{ id: string }>('/api/uploads/manual', {
			method: 'POST',
			json: { bank: manualBank, accountNo: manualAccountNo, openingBalance: manualOpeningBalance || undefined, rows: manualRows }
		});
		await goto(`/uploads/${res.id}`);
	} catch (err) {
		manualErrorMessage = err instanceof ClientApiError ? err.message : err instanceof Error ? err.message : 'Gagal menyimpan';
	} finally {
		manualBusy = false;
	}
}
```

Add the matching imports at the top of the `<script>` block: `import { fieldErrors } from '$lib/forms/validation';`, `import { ManualEntryInput } from '$lib/schemas/upload';`, `import FormField from '$lib/components/FormField.svelte';`, `import DateField from '$lib/components/DateField.svelte';`, `import { inputClass } from '$lib/ui';`.

- [ ] **Step 2: Add the tab toggle and the manual form markup**

Below the `<PageHeader>` and above the existing `<Card.Root>` (which is now shown only `{#if activeTab === 'pdf'}`), add two toggle buttons:

```svelte
<div class="mb-4 flex gap-2" role="tablist">
	<Button variant={activeTab === 'pdf' ? 'default' : 'outline'} onclick={() => (activeTab = 'pdf')} role="tab" aria-selected={activeTab === 'pdf'}>Upload PDF</Button>
	<Button variant={activeTab === 'manual' ? 'default' : 'outline'} onclick={() => (activeTab = 'manual')} role="tab" aria-selected={activeTab === 'manual'}>Input Manual</Button>
</div>
```

Wrap the existing `<Card.Root>` (the PDF form) in `{#if activeTab === 'pdf'}...{/if}`.

Add a second `{#if activeTab === 'manual'}` block with: a `<Card.Root>` containing `<form onsubmit={submitManual}>` with `FormField`-wrapped inputs for `manualBank` (text, `bind:value`, label "Nama bank"), `manualAccountNo` (text, label "Nomor rekening"), `manualOpeningBalance` (text, `inputmode="decimal"`, label "Saldo awal (opsional)"); then a table of `manualRows` where each row has a `DateField` (bind to `.date`), a text input (`.description`, label "Keterangan"), a `direction` radio pair labeled "Keluar (Debit)" / "Masuk (Kredit)", an amount input (`inputmode="decimal"`), and a remove button calling `removeManualRow(i)` (disabled when `manualRows.length === 1`); an "Tambah Baris" button calling `addManualRow()`; an error `<Alert.Root variant="destructive">` shown when `manualErrorMessage`; and a submit `<Button type="submit" disabled={manualBusy}>` labeled "Simpan". Exact spacing, column order, and whether rows render as a `<table>` or stacked cards are left to you — follow this file's and `opening-balance`'s existing visual style.

- [ ] **Step 3: Write the e2e test**

Create `tests/e2e/manual-entry.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/uploads/new');
});

test('creates a manual batch with two rows and redirects to its detail page', async ({ page }) => {
	await page.getByRole('tab', { name: 'Input Manual' }).click();
	await page.getByLabel('Nama bank').fill('Mandiri');
	await page.getByLabel('Nomor rekening').fill('1234567890');
	await page.getByLabel('Keterangan').first().fill('Transfer masuk');
	await page.getByLabel('Masuk (Kredit)').first().check();
	await page.locator('input[inputmode="decimal"]').last().fill('500000');
	const dateInputs = page.locator('[role="spinbutton"]');
	await dateInputs.first().click();
	await page.keyboard.type('08022026');
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page).toHaveURL(/\/uploads\/[0-9a-f-]{36}$/);
});

test('submitting with no account number shows a field error instead of calling the API', async ({ page }) => {
	await page.getByRole('tab', { name: 'Input Manual' }).click();
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page).toHaveURL(/\/uploads\/new$/);
});
```

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `bun run test:e2e tests/e2e/manual-entry.spec.ts`
Expected: PASS. If a selector doesn't match the markup you wrote in Step 2 (e.g. the date-entry interaction, which depends on `DateField`'s exact segmented-input behavior already used elsewhere in this codebase), adjust the test to match your markup rather than changing the feature's behavior — the assertions that matter are "manual tab reachable", "valid submission redirects to the new upload's detail page", and "invalid submission does not navigate away".

- [ ] **Step 5: Run the full unit/integration suite once more for regressions**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/\(app\)/uploads/new/+page.svelte tests/e2e/manual-entry.spec.ts
git commit -m "feat(app): add manual transaction entry tab to /uploads/new"
```
