# Export Data (Excel / CSV / PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add download buttons to 5 existing report pages — Excel/CSV for Jurnal & Buku Besar, PDF (with a company letterhead) for Neraca Saldo, Laporan Posisi Keuangan, and Laba Rugi — each export reflecting exactly what the page currently shows for its active filter.

**Architecture:** Each export is a new `GET /api/reports/<report>/export` route that re-runs the same query function the report page already uses (`listJournal`, `getLedger`, `getTrialBalance`, `getBalanceSheetComparative`, `getIncomeStatementComparative`), then renders it as a file instead of HTML. Excel/CSV reports flatten their view into plain rows (money as real numbers, not display strings) and share one CSV-writing helper. PDF reports share one letterhead-drawing helper (company name/address/NPWP + logo, converting a WebP logo to PNG since `pdfkit` can't embed WebP) but each report draws its own table with `pdfkit`, matching its on-screen layout exactly (including comparative columns and balance warnings).

**Tech Stack:** SvelteKit + Bun, Drizzle ORM/Postgres, `exceljs@4.4.0` (xlsx), `pdfkit@0.20.2` (PDF), `@jsquash/webp@1.5.0` + `@jsquash/png@3.1.1` (WebP→PNG logo conversion), `pdf-parse@2.4.5` (dev-only, to assert PDF text content in tests). All four production libraries and the dev-only PDF-text-extraction library were smoke-tested under Bun during planning (xlsx/PDF byte output verified, WebP decode→PNG encode→PDF embed round-trip verified, PDF text extraction verified) — no Bun-compatibility surprises are expected, but if a task's implementer hits one anyway, report BLOCKED rather than switching libraries silently.

**Spec:** `docs/superpowers/specs/2026-10-18-export-data-design.md`

## Global Constraints

- New dependencies, exact versions: `exceljs@4.4.0`, `pdfkit@0.20.2`, `@jsquash/webp@1.5.0`, `@jsquash/png@3.1.1` (all `dependencies`); `pdf-parse@2.4.5` (`devDependencies`, test-only). No other new dependency without a BLOCKED report and a ruling.
- Money values in Excel/CSV cells are real numbers (`Number(...)`), never an Indonesian-formatted string like `"1.234,00"`.
- CSV files start with a UTF-8 BOM (`﻿`), use `,` as the field delimiter, and `.` as the decimal point; line endings are `\r\n` (RFC4180).
- PDF reports reproduce their on-screen report's content exactly: same rows, same comparative columns (Laporan Posisi Keuangan, Laba Rugi), same two-row grouped header (Neraca Saldo), same balance/unbalanced disclosure — formatted with the existing `formatAccounting`/`formatIdr` (`$lib/money.ts`) and `formatDate`/`formatDateLong`/`formatPeriod` (`$lib/dates.ts`, `$lib/periods.ts`) helpers, not new formatting logic.
- Every export route requires role `viewer` or above via `requireRole(event, 'viewer')` from `$lib/server/rbac`, exactly like the report page it exports (`requirePageRole(event, 'viewer')`), so a wrong role or wrong company is rejected the same way.
- No DB migration. No new table for export history — every file is generated fresh on each request.

## Review Focus

- Excel/CSV money cells must be real numbers, not formatted strings (an Indonesian-style "1.234,00" string would silently defeat the whole point of exporting to a spreadsheet) → Task 1's `buildJournalRows` test and Task 2's `buildLedgerRows` test assert `typeof cell === 'number'` on every money column.
- A CSV opened directly in Excel must show correct characters and correct decimal points, not mojibake or a comma/decimal collision → Task 1's `toCsv` test asserts the exact leading BOM byte, delimiter, and decimal format.
- A company logo (always stored as WebP) must still appear in a generated PDF, not silently disappear because `pdfkit` can't read WebP → Task 4's `toEmbeddablePng` test round-trips a real WebP fixture through decode→encode and confirms the result is a valid, embeddable PNG.
- A request to any export route for a company the caller isn't a member of, or with a role below `viewer`, must be rejected the same way the report page itself rejects it → each export-route task's integration test includes a cross-company/under-role case.
- A trial balance or balance sheet that doesn't balance must say so in the PDF itself, not just via an on-screen badge the PDF silently drops → Task 4's and Task 5's tests assert the "Tidak balance" / unbalanced-dates text is present in the PDF when the fixture data doesn't balance.

---

## Task 1: CSV helper + Journal Excel/CSV export

**Files:**
- Create: `src/lib/server/export/csv.ts`
- Create: `src/lib/server/export/journal.ts`
- Create: `src/routes/api/reports/journal/export/+server.ts`
- Test: `tests/unit/export-csv.test.ts`
- Test: `tests/unit/export-journal.test.ts`
- Test: `tests/integration/export-journal.test.ts`

**Interfaces:**
- Consumes: `listJournal(companyId, from, to)` → `{ entries: JournalEntryView[], totalDebit, totalCredit }` (existing, `$lib/server/journal/queries.ts`). `requireRole`, `dateParam` (existing).
- Produces:
  ```ts
  export function toCsv(headers: string[], rows: (string | number)[][]): string
  export function buildJournalRows(entries: JournalEntryView[]): { headers: string[]; rows: (string | number)[][] }
  ```
  `toCsv` is reused by Task 2 (and, structurally, is the only CSV-writing code in the app — no other task writes CSV independently).

- [ ] **Step 1: Write the failing test for `toCsv`**

```ts
// tests/unit/export-csv.test.ts
import { expect, test } from 'bun:test';
import { toCsv } from '../../src/lib/server/export/csv';

test('writes a UTF-8 BOM, comma delimiter, dot decimals, and CRLF lines', () => {
	const csv = toCsv(['Nama', 'Jumlah'], [['Beban Adm, Bank', 1234.5], ['Café', 0]]);
	expect(csv.charCodeAt(0)).toBe(0xfeff);
	const body = csv.slice(1);
	expect(body.split('\r\n')).toEqual(['Nama,Jumlah', '"Beban Adm, Bank",1234.5', 'Café,0', '']);
});

test('escapes quotes by doubling them', () => {
	const csv = toCsv(['A'], [['She said "hi"']]);
	expect(csv.slice(1)).toBe('A\r\n"She said ""hi"""\r\n');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/export-csv.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/server/export/csv'`.

- [ ] **Step 3: Implement `toCsv` in `src/lib/server/export/csv.ts`**

```ts
export function toCsv(headers: string[], rows: (string | number)[][]): string
```

RFC4180: a cell is quoted (and its own `"` doubled) when it contains a comma, a double quote, or a newline; a plain number is written with `String(n)` (no quoting needed since it never contains those characters). Join cells with `,`, rows with `\r\n`, and prefix the whole string with `﻿`. End the output with a trailing `\r\n` after the last row (matches the test's trailing `''` from `.split('\r\n')`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/export-csv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/export/csv.ts tests/unit/export-csv.test.ts
git commit -m "feat(app): add RFC4180 CSV writer for data exports"
```

- [ ] **Step 6: Write the failing test for `buildJournalRows`**

```ts
// tests/unit/export-journal.test.ts
import { expect, test } from 'bun:test';
import { buildJournalRows } from '../../src/lib/server/export/journal';
import type { JournalEntryView } from '../../src/lib/server/journal/queries';

const entries: JournalEntryView[] = [
	{
		id: '1', entryDate: '2026-08-02', refNo: 'JE-202608-0001', description: 'Biaya admin', type: 'TRANSACTION',
		lines: [
			{ lineId: 'l1', accountId: 'a1', accountCode: '5-2010', accountName: 'Biaya Admin Bank', debit: '30000.00', credit: '0.00', editable: true },
			{ lineId: 'l2', accountId: 'a2', accountCode: '1-1002', accountName: 'Bank', debit: '0.00', credit: '30000.00', editable: false }
		]
	},
	{
		id: '2', entryDate: '2026-08-01', refNo: null, description: null, type: 'OPENING',
		lines: [{ lineId: 'l3', accountId: 'a2', accountCode: '1-1002', accountName: 'Bank', debit: '1000000.00', credit: '0.00', editable: false }]
	}
];

test('one row per line, with entry fields repeated on every line of the same entry', () => {
	const { headers, rows } = buildJournalRows(entries);
	expect(headers).toEqual(['Tanggal', 'No. Ref', 'Keterangan Entry', 'Tipe', 'Kode Akun', 'Nama Akun', 'Debit', 'Kredit']);
	expect(rows).toEqual([
		['2026-08-02', 'JE-202608-0001', 'Biaya admin', 'Transaksi', '5-2010', 'Biaya Admin Bank', 30000, 0],
		['2026-08-02', 'JE-202608-0001', 'Biaya admin', 'Transaksi', '1-1002', 'Bank', 0, 30000],
		['2026-08-01', '', '', 'Saldo Awal', '1-1002', 'Bank', 1000000, 0]
	]);
	for (const r of rows) {
		expect(typeof r[6]).toBe('number');
		expect(typeof r[7]).toBe('number');
	}
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `bun test tests/unit/export-journal.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `buildJournalRows` in `src/lib/server/export/journal.ts`**

```ts
export function buildJournalRows(entries: JournalEntryView[]): { headers: string[]; rows: (string | number)[][] }
```

Map `type` to `{ OPENING: 'Saldo Awal', TRANSACTION: 'Transaksi', CLOSING: 'Penutup' }`; `refNo`/`description` fall back to `''` when `null`. One output row per `line`, with `entryDate`/`refNo`/`description`/the mapped type repeated on every line of that entry (do not blank repeated values the way the on-screen table does). `Number(line.debit)` / `Number(line.credit)` for the two money columns.

- [ ] **Step 9: Run test to verify it passes**

Run: `bun test tests/unit/export-journal.test.ts`
Expected: PASS.

- [ ] **Step 10: Add `exceljs` (this test imports it directly) and write the failing integration test for the route**

Run: `bun add exceljs@4.4.0` — do this first, so the test file's `import ExcelJS from 'exceljs'` resolves and Step 11's failure is about the missing route, not a missing package.

```ts
// tests/integration/export-journal.test.ts
import { beforeEach, expect, test } from 'bun:test';
import ExcelJS from 'exceljs';
import { GET } from '../../src/routes/api/reports/journal/export/+server';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { makeCompany, makeUser, accountIdByCode, addMember, contextFor } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

test('xlsx format: role viewer+ required, bytes parse back to the same rows', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [{ accountId: bankAccountId, debit: '1000000', credit: '0' }, { accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '1000000' }]
	});

	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const url = '/api/reports/journal/export?format=xlsx&from=2026-08-01&to=2026-08-31';
	const res = await GET(fakeEvent({ ctx: await contextFor(viewer, companyId), path: url }) as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toContain('spreadsheetml');
	expect(res.headers.get('content-disposition')).toContain('jurnal_2026-08-01_2026-08-31.xlsx');

	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(await res.arrayBuffer());
	const ws = wb.worksheets[0];
	expect(ws.getRow(1).getCell(1).value).toBe('Tanggal');
	expect(ws.getRow(2).getCell(7).value).toBe(1000000); // Debit, as a number
});

test('csv format: unauthenticated/no-company request is rejected', async () => {
	const url = '/api/reports/journal/export?format=csv&from=2026-08-01&to=2026-08-31';
	const res = await GET(fakeEvent({ ctx: null, path: url }) as never);
	expect(res.status).toBe(401);
});

test('invalid format value is a 400, not a 500', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/journal/export?format=word&from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(400);
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `bun test tests/integration/export-journal.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 12: Implement the route in `src/routes/api/reports/journal/export/+server.ts`**

```ts
export const GET: RequestHandler = (event) => apiHandler(async () => { ... });
```

`requireRole(event, 'viewer')`; read `format` via `z.enum(['xlsx', 'csv']).parse(...)` (a bad value throws `z.ZodError`, which `apiHandler` already turns into a 400 — see `src/lib/server/api.ts`); read `from`/`to` via `dateParam`, defaulting the same way `src/routes/(app)/journal/+page.server.ts` does (`monthRange(todayIso())`); call `listJournal(ctx.companyId, from, to)`, then `buildJournalRows(entries)`. For `xlsx`: build an `ExcelJS.Workbook`, one worksheet, `ws.addRow(headers)` then `rows.forEach(r => ws.addRow(r))`, `await wb.xlsx.writeBuffer()`. For `csv`: `toCsv(headers, rows)`, encoded as UTF-8 bytes. Filename: `` `jurnal_${from}_${to}.${format}` ``. Return `new Response(bytes, { headers: { 'content-type': <xlsx mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' | csv mime: 'text/csv; charset=utf-8'>, 'content-disposition': `attachment; filename="${filename}"` } })`.

- [ ] **Step 13: Run tests to verify they pass**

Run: `bun test tests/integration/export-journal.test.ts`
Expected: PASS.

- [ ] **Step 14: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS, no regressions.

- [ ] **Step 15: Commit**

```bash
git add package.json bun.lock src/lib/server/export/journal.ts src/routes/api/reports/journal/export/+server.ts tests/unit/export-journal.test.ts tests/integration/export-journal.test.ts
git commit -m "feat(app): add Journal Excel/CSV export route"
```

---

## Task 2: Ledger Excel/CSV export

**Files:**
- Create: `src/lib/server/export/ledger.ts`
- Create: `src/routes/api/reports/ledger/export/+server.ts`
- Test: `tests/unit/export-ledger.test.ts`
- Test: `tests/integration/export-ledger.test.ts`

**Interfaces:**
- Consumes: `getLedger(companyId, accountId, from, to)` → `LedgerView` (existing, `$lib/server/reports/ledger.ts`). `toCsv` (Task 1, `$lib/server/export/csv`).
- Produces: `export function buildLedgerRows(ledger: LedgerView): { headers: string[]; rows: (string | number)[][] }` — no later task consumes this; it's the deliverable.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/export-ledger.test.ts
import { expect, test } from 'bun:test';
import { buildLedgerRows } from '../../src/lib/server/export/ledger';
import type { LedgerView } from '../../src/lib/server/reports/ledger';

const ledger: LedgerView = {
	account: { id: 'a1', code: '1-1002', name: 'Bank', normalBal: 'DEBIT' },
	openingBalance: '1000000.00',
	lines: [{ entryDate: '2026-08-02', refNo: 'JE-202608-0001', description: 'Biaya admin', debit: '0.00', credit: '30000.00', balance: '970000.00' }],
	totalDebit: '0.00',
	totalCredit: '30000.00',
	closingBalance: '970000.00'
};

test('opening row, one row per line, closing total row — all money columns numeric', () => {
	const { headers, rows } = buildLedgerRows(ledger);
	expect(headers).toEqual(['Tanggal', 'No. Ref', 'Keterangan', 'Debit', 'Kredit', 'Saldo']);
	expect(rows).toEqual([
		['', '', 'Saldo Awal', '', '', 1000000],
		['2026-08-02', 'JE-202608-0001', 'Biaya admin', 0, 30000, 970000],
		['', '', 'Total', 0, 30000, 970000]
	]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/export-ledger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildLedgerRows` in `src/lib/server/export/ledger.ts`**

Opening row: `['', '', 'Saldo Awal', '', '', Number(ledger.openingBalance)]` (debit/credit columns blank — there's no transaction on the opening row, only a balance). One row per `ledger.lines[i]` with `Number(debit)`/`Number(credit)`/`Number(balance)`. Final row: `['', '', 'Total', Number(totalDebit), Number(totalCredit), Number(closingBalance)]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/export-ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing integration test**

```ts
// tests/integration/export-ledger.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { GET } from '../../src/routes/api/reports/ledger/export/+server';
import { makeCompany, makeUser, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

test('csv format starts with the UTF-8 BOM and the account header is part of the filename', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const url = `/api/reports/ledger/export?format=csv&account_id=${bankAccountId}&from=2026-08-01&to=2026-08-31`;
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: url }) as never);
	expect(res.status).toBe(200);
	const text = await res.text();
	expect(text.charCodeAt(0)).toBe(0xfeff);
	expect(res.headers.get('content-disposition')).toContain('.csv');
});

test('missing account_id is a 400, matching the page’s own "pilih akun" requirement', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/ledger/export?format=csv&from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(400);
});

test('an account_id belonging to another company 404s, not leaking its ledger', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const u = await makeUser();
	const url = `/api/reports/ledger/export?format=csv&account_id=${a.bankAccountId}&from=2026-08-01&to=2026-08-31`;
	const res = await GET(fakeEvent({ ctx: await contextFor(u, b.companyId), path: url }) as never);
	expect(res.status).toBe(404);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test tests/integration/export-ledger.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 7: Implement the route in `src/routes/api/reports/ledger/export/+server.ts`**

Mirrors Task 1's route structure. `requireRole(event, 'viewer')`; `format` via the same `z.enum(['xlsx', 'csv'])`; `account_id` via `uuidSchema.safeParse` (`$lib/server/validation`) — missing or invalid is a 400 (`ApiError(400, 'validation_error', 'Akun wajib dipilih')`), not the page's `ledger: null` placeholder behavior (an export has no "empty state" to render, it's a direct file download); `from`/`to` default the same way `src/routes/(app)/ledger/+page.server.ts` does. `getLedger` itself already 404s for an account outside the caller's company (reuses the existing `notFound('Akun')` in `$lib/server/reports/ledger.ts`) — no extra check needed. Filename: `` `buku-besar_${ledger.account.code}_${from}_${to}.${format}` ``.

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test tests/integration/export-ledger.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/export/ledger.ts src/routes/api/reports/ledger/export/+server.ts tests/unit/export-ledger.test.ts tests/integration/export-ledger.test.ts
git commit -m "feat(app): add Ledger Excel/CSV export route"
```

---

## Task 3: Shared PDF infrastructure — company letterhead

**Files:**
- Modify: `src/lib/server/reports/company.ts`
- Create: `src/lib/server/reports/logo-for-pdf.ts`
- Create: `src/lib/server/reports/pdf-letterhead.ts`
- Test: `tests/integration/export-company-letterhead.test.ts`
- Test: `tests/unit/logo-for-pdf.test.ts`

**Interfaces:**
- Consumes: `getCompanyLogo(companyId)` → `{ content: Uint8Array; mime: string; updatedAt: Date } | null` (existing, `$lib/server/company/logo.ts`). `pdfkit`'s `PDFDocument`.
- Produces (consumed by Tasks 4, 5, 6):
  ```ts
  export async function toEmbeddablePng(content: Uint8Array, mime: string): Promise<Buffer | null>
  export interface LetterheadData { name: string; npwp: string | null; address: string | null; logoPng: Buffer | null }
  export async function getCompanyLetterheadData(companyId: string): Promise<LetterheadData>
  export function drawLetterhead(doc: PDFKit.PDFDocument, company: LetterheadData, reportTitle: string, periodLabel: string): number
  ```
  `drawLetterhead` returns the Y coordinate immediately below everything it drew, so the caller's table starts there.

- [ ] **Step 1: Write the failing test for `toEmbeddablePng`**

```ts
// tests/unit/logo-for-pdf.test.ts
import { expect, test } from 'bun:test';
import { toEmbeddablePng } from '../../src/lib/server/reports/logo-for-pdf';

// 1x1 red pixel, lossless WebP (RIFF/WEBP/VP8L), verified to decode during planning.
const WEBP_1X1 = Buffer.from('UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64');
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('converts a WebP logo to an embeddable PNG', async () => {
	const png = await toEmbeddablePng(WEBP_1X1, 'image/webp');
	expect(png).not.toBeNull();
	expect([...png!.subarray(0, 8)]).toEqual(PNG_MAGIC);
});

test('passes PNG/JPEG through unchanged (pdfkit already reads them natively)', async () => {
	const fakePng = Buffer.from(PNG_MAGIC);
	expect(await toEmbeddablePng(fakePng, 'image/png')).toEqual(fakePng);
});

test('corrupt image bytes are treated as "no logo", not a thrown error', async () => {
	expect(await toEmbeddablePng(Buffer.from('not an image'), 'image/webp')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/logo-for-pdf.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add `@jsquash/webp` and `@jsquash/png`, then implement `toEmbeddablePng` in `src/lib/server/reports/logo-for-pdf.ts`**

Run: `bun add @jsquash/webp@1.5.0 @jsquash/png@3.1.1` first.

```ts
export async function toEmbeddablePng(content: Uint8Array, mime: string): Promise<Buffer | null>
```

`mime === 'image/webp'`: `await decodeWebp(content)` (default export of `@jsquash/webp/decode`) then `await encodePng(imageData)` (default export of `@jsquash/png/encode`), wrapped in `Buffer.from(...)`; wrap the whole decode+encode in `try/catch` and return `null` on any error (a broken/unreadable logo must not fail the PDF, per the spec's anti-goal). Any other mime (`image/png`, `image/jpeg`): return `Buffer.from(content)` unchanged — `pdfkit` embeds both directly.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/logo-for-pdf.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `pdfkit` and `pdf-parse`, then write the failing test for `getCompanyLetterheadData` and `drawLetterhead`**

Run: `bun add pdfkit@0.20.2` and `bun add -d pdf-parse@2.4.5` first — this test file imports both directly, so without them Step 6's failure would be about a missing package, not the missing `pdf-letterhead` module.

```ts
// tests/integration/export-company-letterhead.test.ts
import { beforeEach, expect, test } from 'bun:test';
import PDFDocument from 'pdfkit';
import { PDFParse } from 'pdf-parse';
import { getCompanyLetterheadData, drawLetterhead } from '../../src/lib/server/reports/pdf-letterhead';
import { setCompanyLogo } from '../../src/lib/server/company/logo';
import { makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function renderToText(buildDoc: (doc: PDFKit.PDFDocument) => void): Promise<string> {
	const doc = new PDFDocument();
	const chunks: Buffer[] = [];
	doc.on('data', (c: Buffer) => chunks.push(c));
	const done = new Promise<void>((resolve) => doc.on('end', resolve));
	buildDoc(doc);
	doc.end();
	await done;
	const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
	return (await parser.getText()).text;
}

test('letterhead with no logo uploaded: null logoPng, name/title/period still render', async () => {
	const { companyId } = await makeCompany('PT Uji Coba');
	const company = await getCompanyLetterheadData(companyId);
	expect(company.logoPng).toBeNull();
	expect(company.name).toBe('PT Uji Coba');
	const text = await renderToText((doc) => drawLetterhead(doc, company, 'Neraca Saldo', 'Agustus 2026'));
	expect(text).toContain('PT Uji Coba');
	expect(text).toContain('Neraca Saldo');
	expect(text).toContain('Agustus 2026');
});

test('letterhead with an uploaded WebP logo: logoPng is a real PNG the doc can embed without throwing', async () => {
	const { companyId } = await makeCompany('PT Logo');
	const WEBP_1X1 = Buffer.from('UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64');
	await setCompanyLogo(companyId, WEBP_1X1);
	const company = await getCompanyLetterheadData(companyId);
	expect(company.logoPng).not.toBeNull();
	// Must not throw when pdfkit actually tries to embed it.
	await renderToText((doc) => drawLetterhead(doc, company, 'Neraca Saldo', 'Agustus 2026'));
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test tests/integration/export-company-letterhead.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Extend `getCompanyReportInfo`'s file with `getCompanyLetterheadData`**

In `src/lib/server/reports/company.ts`, add (do not change the existing `getCompanyReportInfo`):

```ts
export interface LetterheadData { name: string; npwp: string | null; address: string | null; logoPng: Buffer | null }

export async function getCompanyLetterheadData(companyId: string): Promise<LetterheadData> {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (!company) throw notFound('Perusahaan');
	const logo = await getCompanyLogo(companyId);
	const logoPng = logo ? await toEmbeddablePng(logo.content, logo.mime) : null;
	return { name: company.name, npwp: company.npwp, address: company.address, logoPng };
}
```

(Imports `getCompanyLogo` from `../company/logo` and `toEmbeddablePng` from `./logo-for-pdf`.)

- [ ] **Step 8: Implement `drawLetterhead` in `src/lib/server/reports/pdf-letterhead.ts`**

```ts
export function drawLetterhead(doc: PDFKit.PDFDocument, company: LetterheadData, reportTitle: string, periodLabel: string): number
```

If `company.logoPng`, `doc.image(company.logoPng, 50, 45, { width: 40, height: 40 })`; the text block (name bold ~12pt, address + NPWP smaller ~9pt below it, if present) starts at x = `company.logoPng ? 100 : 50`, y = 45. Below that block (whichever is taller, logo or text — `pdfkit`'s `doc.y` after the last `.text()` call already tracks this when each `.text()` omits an explicit `y`), draw `reportTitle` (bold, ~14pt) and `periodLabel` (~10pt) left-aligned at x = 50, then a horizontal rule (`doc.moveTo(50, y).lineTo(545, y).stroke()`). Return the y-coordinate just below that rule, with a small margin (e.g. `+ 10`), re-exporting `LetterheadData` and `getCompanyLetterheadData` from this file too (or import both from `./company` — implementer's choice, but Task 4/5/6 import both names from `./pdf-letterhead` per this task's Produces block, so this file must at minimum re-export them).

- [ ] **Step 9: Run tests to verify they pass**

Run: `bun test tests/unit/logo-for-pdf.test.ts tests/integration/export-company-letterhead.test.ts`
Expected: PASS.

- [ ] **Step 10: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS, no regressions.

- [ ] **Step 11: Commit**

```bash
git add package.json bun.lock src/lib/server/reports/company.ts src/lib/server/reports/logo-for-pdf.ts src/lib/server/reports/pdf-letterhead.ts tests/unit/logo-for-pdf.test.ts tests/integration/export-company-letterhead.test.ts
git commit -m "feat(app): add shared PDF letterhead (company name/address/NPWP + logo)"
```

---

## Task 4: Trial Balance PDF export

**Files:**
- Create: `src/routes/api/reports/trial-balance/export/+server.ts`
- Test: `tests/integration/export-trial-balance.test.ts`

**Interfaces:**
- Consumes: `getTrialBalance(companyId, range, opts)` → `TrialBalanceView` (existing, `$lib/server/reports/trial-balance.ts`). `getCompanyLetterheadData`, `drawLetterhead` (Task 3, `$lib/server/reports/pdf-letterhead`). `rangeParams` (existing, `$lib/server/validation`). `formatIdr`, `formatPeriod`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/export-trial-balance.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/reports/trial-balance/export/+server';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { makeCompany, makeUser, accountIdByCode, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function textOf(res: Response): Promise<string> {
	const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
	return (await parser.getText()).text;
}

test('PDF contains account codes/names, totals, and a Balance verdict', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [{ accountId: bankAccountId, debit: '1000000', credit: '0' }, { accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '1000000' }]
	});
	const url = '/api/reports/trial-balance/export?from=2026-08-01&to=2026-08-31';
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: url }) as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('application/pdf');
	const text = await textOf(res);
	expect(text).toContain('1-1002'); // Bank account code
	expect(text).toContain('1.000.000,00');
	expect(text).toContain('Balance');
});

test('an unbalanced book says "Tidak balance" in the PDF, not just on screen', async () => {
	// A lone debit line with no matching credit, via a raw journal insert, makes the book unbalanced
	// without going through generateJournal's own balance check.
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { db } = await import('../../src/lib/server/db');
	const { journalEntries, journalLines } = await import('../../src/lib/server/db/schema');
	const acc = await accountIdByCode(companyId, '5-2010');
	const [entry] = await db.insert(journalEntries).values({ companyId, type: 'TRANSACTION', entryDate: '2026-08-05', createdBy: u.id }).returning({ id: journalEntries.id });
	await db.insert(journalLines).values({ journalId: entry.id, accountId: acc, debit: '500.00', credit: '0.00' });
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/trial-balance/export?from=2026-08-01&to=2026-08-31' }) as never);
	expect(await textOf(res)).toContain('Tidak balance');
});

test('viewer role is enough, accountant-only pages are not required for export', async () => {
	const { companyId } = await makeCompany();
	const viewer = await makeUser();
	const { addMember } = await import('./factory');
	await addMember(viewer.id, companyId, 'viewer');
	const res = await GET(fakeEvent({ ctx: await contextFor(viewer, companyId), path: '/api/reports/trial-balance/export?from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(200);
});

test('no company context (not a member of any company) is a 401, same as the page itself', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/reports/trial-balance/export?from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/export-trial-balance.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route in `src/routes/api/reports/trial-balance/export/+server.ts`**

`requireRole(event, 'viewer')`; resolve `range`/`closing` exactly like `src/routes/(app)/trial-balance/+page.server.ts` does (`getCompanyReportInfo` for `fiscalYear`, `defaultReportRange`, `rangeParams`, `?closing=1`) — a range error here is a 400 `ApiError`, not the page's soft-fallback (there is no form to redisplay on a file-download route). Call `getTrialBalance(ctx.companyId, range, { includeClosing: closing })` and `getCompanyLetterheadData(ctx.companyId)`. Build the PDF: `drawLetterhead(doc, company, 'Neraca Saldo', formatPeriod(range.from, range.to))` returns `y`; draw the 8-column table (Kode, Akun, Saldo Awal Debit/Kredit, Mutasi Debit/Kredit, Saldo Akhir Debit/Kredit) starting at that `y`, one `doc.text(...)` per cell at fixed x-offsets, using `formatIdr` for non-zero cells (blank for `'0.00'`, matching the page's own `cell()` helper); a totals row; then `doc.text(tb.balanced ? 'Balance' : 'Tidak balance', ...)`. Filename `` `neraca-saldo_${range.from}_${range.to}.pdf` ``, `content-type: application/pdf`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/integration/export-trial-balance.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api/reports/trial-balance/export/+server.ts tests/integration/export-trial-balance.test.ts
git commit -m "feat(app): add Trial Balance PDF export route"
```

---

## Task 5: Balance Sheet PDF export

**Files:**
- Create: `src/routes/api/reports/balance-sheet/export/+server.ts`
- Test: `tests/integration/export-balance-sheet.test.ts`

**Interfaces:**
- Consumes: `getBalanceSheetComparative(companyId, asOf)` → `{ current: BalanceSheetView, comparative: BalanceSheetView }` (existing, `$lib/server/reports/balance-sheet.ts`). `getCompanyLetterheadData`, `drawLetterhead` (Task 3). `dateParam`, `formatAccounting`, `formatDateLong`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/export-balance-sheet.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/reports/balance-sheet/export/+server';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { makeCompany, makeUser, accountIdByCode, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function textOf(res: Response): Promise<string> {
	const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
	return (await parser.getText()).text;
}

test('PDF shows both the asOf and comparative columns worth of content, and balances', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-01-01',
		lines: [{ accountId: bankAccountId, debit: '2000000', credit: '0' }, { accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '2000000' }]
	});
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/balance-sheet/export?as_of=2026-08-31' }) as never);
	expect(res.status).toBe(200);
	const text = await textOf(res);
	expect(text).toContain('ASET');
	expect(text).toContain('JUMLAH ASET');
	expect(text).toContain('2.000.000,00');
	expect(text).not.toContain('Jumlah aset tidak sama'); // balanced, no warning text
});

test('an unbalanced sheet prints the "Jumlah aset tidak sama..." warning with its date(s)', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { db } = await import('../../src/lib/server/db');
	const { journalEntries, journalLines } = await import('../../src/lib/server/db/schema');
	const acc = await accountIdByCode(companyId, '5-2010');
	const [entry] = await db.insert(journalEntries).values({ companyId, type: 'TRANSACTION', entryDate: '2026-08-05', createdBy: u.id }).returning({ id: journalEntries.id });
	await db.insert(journalLines).values({ journalId: entry.id, accountId: acc, debit: '500.00', credit: '0.00' });
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/balance-sheet/export?as_of=2026-08-31' }) as never);
	expect(await textOf(res)).toContain('tidak sama dengan jumlah liabilitas');
});

test('no company context is a 401, same as the page itself', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/reports/balance-sheet/export?as_of=2026-08-31' }) as never);
	expect(res.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/export-balance-sheet.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route in `src/routes/api/reports/balance-sheet/export/+server.ts`**

`requireRole(event, 'viewer')`; `asOf` via `dateParam(event.url, 'as_of') ?? defaultBalanceSheetAsOf(todayIso(), company.fiscalYear)` (same default as the page, via `getCompanyReportInfo` for `fiscalYear`). Call `getBalanceSheetComparative` and `getCompanyLetterheadData`. `drawLetterhead(doc, company, 'Laporan Posisi Keuangan', `` `Per ${formatDateLong(current.asOf)} dan ${formatDateLong(comparative.asOf)}` ``)`. Draw the 3-column table (Keterangan | current | comparative) recursively for each `BalanceSheetLine` (indent by depth, "Jumlah {name}" subtotal row when `children.length > 0`, mirroring `balance-sheet/+page.svelte`'s `line`/`section` snippets) for `assets.current`, `assets.nonCurrent`, a `JUMLAH ASET` row, `liabilities.current`, `liabilities.nonCurrent`, a `Jumlah Liabilitas` row, `equity`, and a `JUMLAH LIABILITAS DAN EKUITAS` row — same order as the page. Compute `badDates` exactly like the page's `$derived` does (`[...(current.balanced ? [] : [current.asOf]), ...(comparative.balanced ? [] : [comparative.asOf])].map(formatDateLong).join(' dan ')`) and, when not both balanced, draw `` `Jumlah aset tidak sama dengan jumlah liabilitas dan ekuitas per ${badDates}. Periksa saldo awal dan jurnal.` `` below the table. Filename `` `laporan-posisi-keuangan_${current.asOf}.pdf` ``.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/integration/export-balance-sheet.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api/reports/balance-sheet/export/+server.ts tests/integration/export-balance-sheet.test.ts
git commit -m "feat(app): add Balance Sheet PDF export route"
```

---

## Task 6: Income Statement PDF export

**Files:**
- Create: `src/routes/api/reports/income-statement/export/+server.ts`
- Test: `tests/integration/export-income-statement.test.ts`

**Interfaces:**
- Consumes: `getIncomeStatementComparative(companyId, range)` → `{ current: IncomeStatementView, comparative: IncomeStatementView }` (existing, `$lib/server/reports/income-statement.ts`). `getCompanyLetterheadData`, `drawLetterhead` (Task 3). `rangeParams`, `formatAccounting`, `formatPeriod`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/export-income-statement.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/reports/income-statement/export/+server';
import { makeCompany, makeUser, makeUpload, accountIdByCode, contextFor } from './factory';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { db } from '../../src/lib/server/db';
import { transactions } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function textOf(res: Response): Promise<string> {
	const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
	return (await parser.getText()).text;
}

test('PDF shows revenue, Laba Kotor/Usaha/Sebelum Pajak subtotals and Laba Bersih', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const pendapatan = await accountIdByCode(companyId, '4-1001');
	const { uploadId } = await makeUpload(companyId, u.id, [{ date: '2026-08-05', description: 'Jasa', credit: '5000000' }]);
	await db.update(transactions).set({ isConfirmed: true, accountId: pendapatan }).where(eq(transactions.description, 'Jasa'));
	await generateJournal(companyId, uploadId, u.id);
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/income-statement/export?from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(200);
	const text = await textOf(res);
	expect(text).toContain('Pendapatan Usaha');
	expect(text).toContain('Laba Kotor');
	expect(text).toContain('Laba Bersih');
	expect(text).toContain('5.000.000,00');
});

test('no company context is a 401, same as the page itself', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/reports/income-statement/export?from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/export-income-statement.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route in `src/routes/api/reports/income-statement/export/+server.ts`**

Mirrors Task 5's structure (`requireRole`, `rangeParams` with the same defaults the page uses via `getCompanyReportInfo`/`defaultReportRange`). `drawLetterhead(doc, company, 'Laba Rugi', formatPeriod(current.from, current.to))`. Draw the 3-column table (Keterangan | current period | comparative period) for each section in `current.sections` in order (flat lines, `pl`-equivalent indent, "Jumlah {title}" subtotal), inserting `Laba Kotor` after `cogs`, `Laba Usaha` after `opex`, `Laba Sebelum Pajak` after `otherExpense` — same order as `income-statement/+page.svelte`'s `{#each}` — then a final `Laba Bersih` row from `netProfit`. Filename `` `laba-rugi_${current.from}_${current.to}.pdf` ``.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/integration/export-income-statement.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api/reports/income-statement/export/+server.ts tests/integration/export-income-statement.test.ts
git commit -m "feat(app): add Income Statement PDF export route"
```

---

## Task 7: Download buttons on all 5 report pages

**Files:**
- Modify: `src/routes/(app)/journal/+page.svelte`
- Modify: `src/routes/(app)/ledger/+page.svelte`
- Modify: `src/routes/(app)/trial-balance/+page.svelte`
- Modify: `src/routes/(app)/balance-sheet/+page.svelte`
- Modify: `src/routes/(app)/income-statement/+page.svelte`
- Test: `tests/e2e/export-buttons.spec.ts`

**Interfaces:**
- Consumes: all 5 export routes (Tasks 1, 2, 4, 5, 6) by their fixed paths and query params. `Button` (existing, `$lib/components/ui/button`, supports `href`).
- Produces: nothing consumed by a later task — this is the last task.

- [ ] **Step 1: Add download buttons to each page's `PageHeader` `actions` snippet**

- **Journal** (`journal/+page.svelte`, currently `<PageHeader title="Jurnal Umum" />` with no `actions`): add an `actions` snippet with two `<Button href="..." variant="outline">` ("Unduh Excel", "Unduh CSV"), `href` a `$derived` of `` `/api/reports/journal/export?format=xlsx&from=${data.from}&to=${data.to}` `` (and `format=csv` for the second).
- **Ledger** (`ledger/+page.svelte`, no `actions` currently): same two buttons, `href` includes `&account_id=${data.accountId}` too, and both buttons are only rendered `{#if data.ledger}` (there is nothing to export before an account is picked — matches the page's own "Pilih akun…" placeholder behavior).
- **Trial Balance** (`trial-balance/+page.svelte`, already has an `actions` snippet with the Balance Badge): add one `<Button href="...">Unduh PDF</Button>` next to the Badge, `href` built from `tb.from`/`tb.to`/`closing`.
- **Balance Sheet** (`balance-sheet/+page.svelte`, already has an `actions` snippet with the Badge): add one PDF button next to it, `href` from `cur.asOf`.
- **Income Statement** (`income-statement/+page.svelte`, currently no `actions`): add an `actions` snippet with one PDF button, `href` from `cur.from`/`cur.to`.

- [ ] **Step 2: Write the e2e test**

```ts
// tests/e2e/export-buttons.spec.ts
import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
});

test('journal page offers Excel and CSV downloads for the active date range', async ({ page }) => {
	await page.goto('/journal?from=2026-08-01&to=2026-08-31');
	const excel = page.getByRole('link', { name: 'Unduh Excel' });
	await expect(excel).toHaveAttribute('href', /format=xlsx&from=2026-08-01&to=2026-08-31/);
	await expect(page.getByRole('link', { name: 'Unduh CSV' })).toHaveAttribute('href', /format=csv/);
});

test('trial balance page offers a PDF download that actually returns a PDF', async ({ page }) => {
	await page.goto('/trial-balance?from=2026-08-01&to=2026-08-31');
	const href = await page.getByRole('link', { name: 'Unduh PDF' }).getAttribute('href');
	const res = await page.request.get(href!);
	expect(res.headers()['content-type']).toBe('application/pdf');
});

test('ledger page hides the download buttons until an account is selected', async ({ page }) => {
	await page.goto('/ledger');
	await expect(page.getByRole('link', { name: 'Unduh Excel' })).toHaveCount(0);
});
```

- [ ] **Step 3: Run the e2e test**

Run: `bun run test:e2e tests/e2e/export-buttons.spec.ts`
Expected: PASS. If a selector doesn't match the exact button markup/label you wrote in Step 1, adjust the test to match — the behaviors that matter are "the right query params reach the href", "a PDF button's href really serves a PDF", and "Ledger hides its buttons with no account selected".

- [ ] **Step 4: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/journal/+page.svelte" "src/routes/(app)/ledger/+page.svelte" "src/routes/(app)/trial-balance/+page.svelte" "src/routes/(app)/balance-sheet/+page.svelte" "src/routes/(app)/income-statement/+page.svelte" tests/e2e/export-buttons.spec.ts
git commit -m "feat(app): add download buttons to the 5 report pages"
```
