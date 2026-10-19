# Invoicing (Contacts, Invoice, Advance Receipt, Purchase Order) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Contacts (customer/vendor master data), Invoice, Advance Receipt (Uang Muka), and Purchase Order — each with a status lifecycle, automatic double-entry journal posting at the right lifecycle step, sequential document numbering, and a printable PDF reusing the Export feature's PDF infrastructure.

**Architecture:** Six new tables (contacts, invoices, invoice_lines, advance_receipts, purchase_orders, purchase_order_lines) plus one new tiny counter table for document numbering, plus three new nullable link-back columns on the existing `journal_entries` table (mirroring its existing `uploadId`/`transactionId` pattern). A shared `postJournal`/`reverseJournalEntries` pair in a new `invoicing/posting.ts` module is the single place that builds balanced journal entries and their reversals, used by every lifecycle transition across all three document types — never built per-document. Invoice and Purchase Order both go Draft (unposted, editable, no number) → a first real transition that assigns the document number and, for Invoice, also posts → an optional terminal posting step (PO's "Diterima") → Lunas/Cancelled. Advance Receipt has no Draft stage: it's created already posted. PDF generation and the account-picker UI reuse the Export feature's `pdf-scaffold`/`pdf-letterhead` and the existing `SearchSelect`/`accountOptions` helper, both unmodified.

**Tech Stack:** SvelteKit + Svelte 5 runes, Drizzle ORM/Postgres, Bun, `pdfkit`/`@jsquash/*` (already installed, from Export), bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-invoicing-design.md`

## Global Constraints

- No migration to any existing table except three new nullable columns on `journal_entries`: `invoiceId` (FK→invoices, `set null`), `purchaseOrderId` (FK→purchase_orders, `set null`), `advanceReceiptId` (FK→advance_receipts, `set null`) — purely additive, mirrors the existing `uploadId`/`transactionId` pattern on that same table.
- `journal_entries.type` keeps its current three values (`'OPENING'|'TRANSACTION'|'CLOSING'`) — invoicing journals use `'TRANSACTION'`, distinguished by the new back-link columns, not by a new enum value.
- No new dependency — `pdfkit`, `@jsquash/webp`, `@jsquash/png` are already installed from the Export feature.
- Receivable, payable, revenue, expense, tax, and deferred-revenue accounts are always picked by the user from the existing Chart of Accounts (via `SearchSelect` + `accountOptions`), never hardcoded by account code — different CoA templates use different codes for the same concept.
- Money values follow this codebase's existing convention: Zod `moneyString` on input, `D()`/`toMoney()`/`sumMoney()` (`$lib/money.ts`) for arithmetic, never a raw `Number()` add/subtract on money strings.
- Every journal posting uses the existing `assertPeriodOpen` (`$lib/server/closing/lock.ts`) and `assertBalanced` (`$lib/server/journal/lines.ts`) — no new balance-checking logic.
- A Draft invoice/PO (never posted, never numbered) may be hard-deleted. A posted document is never hard-deleted — only cancelled, which creates a reversing journal entry, never deletes the original.
- Role: creating/editing any document (incl. Draft) and triggering a posting transition (Kirim, Diterima, Lunas, Terapkan Uang Muka) = `accountant` or above. Cancelling an already-posted document = `admin` (mirrors `DELETE /api/uploads/[id]`). Cancelling/deleting a Draft = `accountant` or above. Viewing lists/details/PDFs = `viewer` or above.

## Review Focus

- Cancelling a `PAID` invoice that was settled via an Advance Receipt must release that receipt back to `ACTIVE` (clear `appliedToInvoiceId`) — otherwise the money is stranded, unusable and unrefundable → Task 9's cancel-unwind test.
- An account picked for a line item or a document-level field (revenue/expense/tax/receivable/payable/deferred-revenue) must actually be the right account *type* (e.g. a revenue account can't be picked as the tax account) — a wrong type must be rejected at validation time, not silently posted with backwards signs → Task 3's `assertAccountOfType` tests, exercised again by Task 5's and Task 11's creation tests.
- Applying an Advance Receipt to an invoice belonging to a *different* contact, or whose amount doesn't match exactly, must be rejected with a clear error, not accepted with a journal that doesn't actually net to zero on the receivable → Task 9's mismatch tests.
- Posting a transition (Kirim/Diterima/Lunas/Terima Uang Muka) dated inside a closed fiscal period must be rejected the same way every other posting path in this app already is → Task 6/7/8/12's `assertPeriodOpen` tests.
- A Draft invoice/PO must never have a document number or any journal trace, and deleting it must never create a numbering gap for documents that *were* actually issued — Task 5/11's "draft has no number, no journal" tests and Task 6/11's "number assigned exactly at the first real transition" tests.

---

## Task 1: Schema — new tables, counter table, and `journal_entries` back-link columns

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Create: `drizzle/migrations/00XX_<name>.sql` (generated, not hand-written)
- Test: `tests/integration/invoicing-schema.test.ts`

**Interfaces:**
- Produces: Drizzle table objects `contacts`, `invoices`, `invoiceLines`, `advanceReceipts`, `purchaseOrders`, `purchaseOrderLines`, `documentNumberCounters`, plus three new columns on the existing `journalEntries` export (`invoiceId`, `purchaseOrderId`, `advanceReceiptId`). Every later task imports these from `'../db/schema'` (or `'$lib/server/db/schema'` from routes).

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/invoicing-schema.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { contacts, invoices, invoiceLines, advanceReceipts, purchaseOrders, purchaseOrderLines, documentNumberCounters, journalEntries } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('new tables accept a minimal row each, scoped to the company', async () => {
	const { companyId } = await makeCompany();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'BOTH', name: 'PT Mitra' }).returning();
	const [invoice] = await db
		.insert(invoices)
		.values({ companyId, contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: await accountIdByCode(companyId, '1-1003'), subtotal: '0', total: '0' })
		.returning();
	await db.insert(invoiceLines).values({ invoiceId: invoice.id, lineNo: 1, description: 'Jasa', quantity: '1', unitPrice: '0', amount: '0', revenueAccountId: await accountIdByCode(companyId, '4-1001') });
	const [po] = await db
		.insert(purchaseOrders)
		.values({ companyId, contactId: contact.id, issueDate: '2026-10-01', payableAccountId: await accountIdByCode(companyId, '2-1001'), subtotal: '0', total: '0' })
		.returning();
	await db.insert(purchaseOrderLines).values({ poId: po.id, lineNo: 1, description: 'Sewa', quantity: '1', unitPrice: '0', amount: '0', expenseAccountId: await accountIdByCode(companyId, '5-2010') });
	await db.insert(advanceReceipts).values({ companyId, contactId: contact.id, receiptNo: 'UM-2026-0001', receiptDate: '2026-10-01', amount: '0', deferredRevenueAccountId: await accountIdByCode(companyId, '2-1007') });
	await db.insert(documentNumberCounters).values({ companyId, prefix: 'INV', year: '2026', lastSeq: 1 });

	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, invoice.id) }))?.status).toBe('DRAFT');
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, po.id) }))?.status).toBe('DRAFT');
});

test('journal_entries accepts the new nullable back-link columns, defaulting to null', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const [entry] = await db.insert(journalEntries).values({ companyId, type: 'TRANSACTION', entryDate: '2026-10-01', createdBy: u.id }).returning();
	expect(entry.invoiceId).toBeNull();
	expect(entry.purchaseOrderId).toBeNull();
	expect(entry.advanceReceiptId).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-schema.test.ts`
Expected: FAIL — tables/columns don't exist (import error or Drizzle "unknown table").

- [ ] **Step 3: Add the schema**

In `src/lib/server/db/schema.ts`, add enums `contactKind = pgEnum('contact_kind', ['CUSTOMER', 'VENDOR', 'BOTH'])`, `invoiceStatus = pgEnum('invoice_status', ['DRAFT', 'SENT', 'PAID', 'CANCELLED'])`, `poStatus = pgEnum('po_status', ['DRAFT', 'ISSUED', 'RECEIVED', 'CANCELLED'])`, `advanceReceiptStatus = pgEnum('advance_receipt_status', ['ACTIVE', 'APPLIED', 'REFUNDED'])`.

```ts
export const contacts = pgTable('contacts', {
	id: uuid('id').primaryKey().defaultRandom(),
	companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
	kind: contactKind('kind').notNull(),
	name: text('name').notNull(),
	npwp: varchar('npwp', { length: 20 }),
	address: text('address'),
	email: text('email'),
	phone: varchar('phone', { length: 30 }),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: createdAt()
});

export const invoices = pgTable('invoices', {
	id: uuid('id').primaryKey().defaultRandom(),
	companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
	contactId: uuid('contact_id').notNull().references(() => contacts.id),
	invoiceNo: varchar('invoice_no', { length: 30 }),
	issueDate: day('issue_date').notNull(),
	receivableAccountId: uuid('receivable_account_id').notNull().references(() => accounts.id),
	status: invoiceStatus('status').notNull().default('DRAFT'),
	subtotal: money('subtotal').notNull(),
	taxRate: numeric('tax_rate', { precision: 5, scale: 2 }),
	taxAccountId: uuid('tax_account_id').references(() => accounts.id),
	taxAmount: money('tax_amount').notNull().default('0'),
	total: money('total').notNull(),
	notes: text('notes'),
	paidViaAdvanceReceiptId: uuid('paid_via_advance_receipt_id').references(() => advanceReceipts.id),
	createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
	createdAt: createdAt()
}, (t) => [unique('invoices_company_no_uq').on(t.companyId, t.invoiceNo)]);

export const invoiceLines = pgTable('invoice_lines', {
	id: uuid('id').primaryKey().defaultRandom(),
	invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
	lineNo: integer('line_no').notNull(),
	description: text('description').notNull(),
	quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(),
	unitPrice: money('unit_price').notNull(),
	amount: money('amount').notNull(),
	revenueAccountId: uuid('revenue_account_id').notNull().references(() => accounts.id)
});
// purchaseOrders / purchaseOrderLines mirror invoices / invoiceLines: poNo instead of invoiceNo,
// payableAccountId instead of receivableAccountId, poStatus instead of invoiceStatus, expectedDate
// (day, nullable) added, no paidViaAdvanceReceiptId; purchaseOrderLines' expenseAccountId instead
// of revenueAccountId. Unique constraint `purchase_orders_company_no_uq` on (companyId, poNo).

export const advanceReceipts = pgTable('advance_receipts', {
	id: uuid('id').primaryKey().defaultRandom(),
	companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
	contactId: uuid('contact_id').notNull().references(() => contacts.id),
	receiptNo: varchar('receipt_no', { length: 30 }).notNull(),
	receiptDate: day('receipt_date').notNull(),
	amount: money('amount').notNull(),
	status: advanceReceiptStatus('status').notNull().default('ACTIVE'),
	deferredRevenueAccountId: uuid('deferred_revenue_account_id').notNull().references(() => accounts.id),
	appliedToInvoiceId: uuid('applied_to_invoice_id').references(() => invoices.id),
	createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
	createdAt: createdAt()
}, (t) => [unique('advance_receipts_company_no_uq').on(t.companyId, t.receiptNo)]);

export const documentNumberCounters = pgTable('document_number_counters', {
	companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
	prefix: varchar('prefix', { length: 10 }).notNull(),
	year: varchar('year', { length: 4 }).notNull(),
	lastSeq: integer('last_seq').notNull().default(0)
}, (t) => [primaryKey({ columns: [t.companyId, t.prefix, t.year] })]);
```

Add to the existing `journalEntries` table definition: `invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' })`, `purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'set null' })`, `advanceReceiptId: uuid('advance_receipt_id').references(() => advanceReceipts.id, { onDelete: 'set null' })`. Import `primaryKey` from `drizzle-orm/pg-core` alongside the existing imports on that line.

- [ ] **Step 4: Generate and run the migration**

Run: `bun run db:generate` then `bun run db:migrate`.
Expected: a new file under `drizzle/migrations/`, migration applies cleanly against the dev/test database.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/integration/invoicing-schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/db/schema.ts drizzle/migrations tests/integration/invoicing-schema.test.ts
git commit -m "feat(app): add contacts/invoices/purchase-orders/advance-receipts schema"
```

---

## Task 2: Document numbering helper

**Files:**
- Create: `src/lib/server/invoicing/numbering.ts`
- Test: `tests/integration/invoicing-numbering.test.ts`

**Interfaces:**
- Consumes: `documentNumberCounters` (Task 1).
- Produces: `export async function nextDocumentNumber(tx: Tx, companyId: string, prefix: 'INV' | 'UM' | 'PO', year: string): Promise<string>` — called by every later task that assigns a document number.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/invoicing-numbering.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { db } from '../../src/lib/server/db';
import { nextDocumentNumber } from '../../src/lib/server/invoicing/numbering';
import { makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('numbers are sequential per company, per prefix, per year, starting at 0001', async () => {
	const { companyId } = await makeCompany();
	await db.transaction(async (tx) => {
		expect(await nextDocumentNumber(tx, companyId, 'INV', '2026')).toBe('INV-2026-0001');
		expect(await nextDocumentNumber(tx, companyId, 'INV', '2026')).toBe('INV-2026-0002');
	});
});

test('different prefixes and different years each have their own independent sequence', async () => {
	const { companyId } = await makeCompany();
	await db.transaction(async (tx) => {
		expect(await nextDocumentNumber(tx, companyId, 'PO', '2026')).toBe('PO-2026-0001');
		expect(await nextDocumentNumber(tx, companyId, 'INV', '2026')).toBe('INV-2026-0001');
		expect(await nextDocumentNumber(tx, companyId, 'INV', '2027')).toBe('INV-2027-0001');
	});
});

test('two companies never share a sequence', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	await db.transaction(async (tx) => {
		expect(await nextDocumentNumber(tx, a.companyId, 'INV', '2026')).toBe('INV-2026-0001');
		expect(await nextDocumentNumber(tx, b.companyId, 'INV', '2026')).toBe('INV-2026-0001');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-numbering.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `nextDocumentNumber` in `src/lib/server/invoicing/numbering.ts`**

```ts
export async function nextDocumentNumber(tx: Tx, companyId: string, prefix: 'INV' | 'UM' | 'PO', year: string): Promise<string>
```

Use a single atomic `INSERT ... ON CONFLICT (companyId, prefix, year) DO UPDATE SET lastSeq = documentNumberCounters.lastSeq + 1 RETURNING lastSeq` (Drizzle: `.insert(documentNumberCounters).values({companyId, prefix, year, lastSeq: 1}).onConflictDoUpdate({target: [documentNumberCounters.companyId, documentNumberCounters.prefix, documentNumberCounters.year], set: {lastSeq: sql`${documentNumberCounters.lastSeq} + 1`}}).returning({lastSeq: documentNumberCounters.lastSeq})`) — this is safe under concurrent calls without a separate row lock, since the upsert itself is atomic at the Postgres row level. Format the return value as `` `${prefix}-${year}-${String(row.lastSeq).padStart(4, '0')}` ``.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/integration/invoicing-numbering.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/invoicing/numbering.ts tests/integration/invoicing-numbering.test.ts
git commit -m "feat(app): add sequential document numbering helper"
```

---

## Task 3: Shared posting/reversal helpers + account-type assertion

**Files:**
- Create: `src/lib/server/invoicing/posting.ts`
- Create: `src/lib/server/invoicing/accounts.ts`
- Test: `tests/integration/invoicing-posting.test.ts`
- Test: `tests/integration/invoicing-accounts.test.ts`

**Interfaces:**
- Consumes: `assertBalanced`, `JournalLineInput` (existing, `$lib/server/journal/lines.ts`). `assertLeafAccount` (existing, `$lib/server/accounts/queries.ts`). `journalEntries`, `journalLines` (Task 1/existing).
- Produces:
  ```ts
  // posting.ts
  export async function postJournal(tx: Tx, params: { companyId: string; entryDate: string; description: string; refNo: string; createdBy: string; lines: JournalLineInput[]; invoiceId?: string; purchaseOrderId?: string; advanceReceiptId?: string }): Promise<{ id: string }>
  export async function reverseJournalEntries(tx: Tx, params: { companyId: string; createdBy: string; invoiceId?: string; purchaseOrderId?: string; advanceReceiptId?: string; descriptionPrefix: string }): Promise<void>
  // accounts.ts
  export async function assertAccountOfType(ex: Executor, companyId: string, accountId: string, type: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE'): Promise<{ id: string; code: string; name: string }>
  ```
  Every service task (5-12) uses `postJournal` for every posting and `reverseJournalEntries` for every cancel-with-reversal; every create/edit task uses `assertAccountOfType` to validate each account-picker field.

- [ ] **Step 1: Write the failing tests for `posting.ts`**

```ts
// tests/integration/invoicing-posting.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { journalEntries, journalLines, contacts, invoices } from '../../src/lib/server/db/schema';
import { postJournal, reverseJournalEntries } from '../../src/lib/server/invoicing/posting';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('postJournal inserts a balanced entry and sets the requested back-link column', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const revenue = await accountIdByCode(companyId, '4-1001');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const [invoice] = await db.insert(invoices).values({ companyId, contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: bankAccountId, subtotal: '0', total: '0' }).returning();

	const { id } = await db.transaction((tx) =>
		postJournal(tx, {
			companyId, createdBy: u.id, entryDate: '2026-10-01', description: 'Invoice INV-2026-0001', refNo: 'INV-2026-0001',
			lines: [{ accountId: bankAccountId, debit: '100000.00', credit: '0.00' }, { accountId: revenue, debit: '0.00', credit: '100000.00' }],
			invoiceId: invoice.id
		})
	);
	const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, id) });
	expect(entry).toMatchObject({ type: 'TRANSACTION', refNo: 'INV-2026-0001', invoiceId: invoice.id, purchaseOrderId: null, advanceReceiptId: null });
	expect(await db.select().from(journalLines).where(eq(journalLines.journalId, id))).toHaveLength(2);
});

test('postJournal rejects unbalanced lines, same error as the existing journal path', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await expect(
		db.transaction((tx) => postJournal(tx, { companyId, createdBy: u.id, entryDate: '2026-10-01', description: 'x', refNo: 'x', lines: [{ accountId: bankAccountId, debit: '100.00', credit: '0.00' }] }))
	).rejects.toMatchObject({ code: 'unbalanced' });
});

test('reverseJournalEntries creates a swapped-sign entry per original, same refNo, linked to the same invoice', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const revenue = await accountIdByCode(companyId, '4-1001');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const [invoice] = await db.insert(invoices).values({ companyId, contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: bankAccountId, subtotal: '0', total: '0' }).returning();
	await db.transaction((tx) =>
		postJournal(tx, { companyId, createdBy: u.id, entryDate: '2026-10-01', description: 'x', refNo: 'INV-2026-0001', lines: [{ accountId: bankAccountId, debit: '100000.00', credit: '0.00' }, { accountId: revenue, debit: '0.00', credit: '100000.00' }], invoiceId: invoice.id })
	);
	await db.transaction((tx) => reverseJournalEntries(tx, { companyId, createdBy: u.id, invoiceId: invoice.id, descriptionPrefix: 'Pembalikan' }));

	const entries = await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, invoice.id));
	expect(entries).toHaveLength(2);
	const reversal = entries.find((e) => e.description?.startsWith('Pembalikan'))!;
	expect(reversal.refNo).toBe('INV-2026-0001');
	const lines = await db.select().from(journalLines).where(eq(journalLines.journalId, reversal.id));
	expect(lines).toEqual(expect.arrayContaining([
		expect.objectContaining({ accountId: bankAccountId, debit: '0.00', credit: '100000.00' }),
		expect.objectContaining({ accountId: revenue, debit: '100000.00', credit: '0.00' })
	]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-posting.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `posting.ts`**

`postJournal`: insert into `journalEntries` with `type: 'TRANSACTION'`, the given `invoiceId`/`purchaseOrderId`/`advanceReceiptId` (whichever is passed, others left `undefined`/null), call `assertBalanced(params.lines)` before inserting, then insert `journalLines` mapping `journalId: entry.id`. Mirrors the body shape of `generateJournal` in `journal/generate.ts` minus the sequence-number generation (the caller already has `refNo`).

`reverseJournalEntries`: select all `journalEntries` rows matching whichever of `invoiceId`/`purchaseOrderId`/`advanceReceiptId` was passed, for `companyId`, join their `journalLines`; for each original entry, call `postJournal` again with the same `refNo`, `description: `${params.descriptionPrefix} ${original.refNo}``, `entryDate: todayIso()`, and lines with `debit`/`credit` swapped per line, passing through the same back-link id the original entry had.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/integration/invoicing-posting.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `accounts.ts`**

```ts
// tests/integration/invoicing-accounts.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { assertAccountOfType } from '../../src/lib/server/invoicing/accounts';
import { makeCompany, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const codeOf = async (p: Promise<unknown>) => {
	try { await p; } catch (e) { return (e as { code: string }).code; }
	return null;
};

test('accepts an account whose type matches', async () => {
	const { companyId } = await makeCompany();
	const id = await accountIdByCode(companyId, '4-1001');
	const row = await assertAccountOfType({} as never, companyId, id, 'REVENUE');
	expect(row.id).toBe(id);
});

test('rejects an account whose type does not match, with a clear message', async () => {
	const { companyId } = await makeCompany();
	const expenseAccount = await accountIdByCode(companyId, '5-2010');
	expect(await codeOf(assertAccountOfType({} as never, companyId, expenseAccount, 'REVENUE'))).toBe('wrong_account_type');
});
```

(The first test passes `{} as never` as the executor placeholder only to be replaced with the real `db` import — write it as `assertAccountOfType(db, ...)` using `import { db } from '../../src/lib/server/db';`, not literally `{} as never`.)

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-accounts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `assertAccountOfType` in `accounts.ts`**

Call `assertLeafAccount(ex, companyId, accountId)` (existing, throws `invalid_account` for inactive/non-leaf/foreign accounts already) then check `row.type === type`; if not, throw `new ApiError(422, 'wrong_account_type', `Akun ini harus bertipe ${type}`, undefined, { field: 'accountId' })` (import `ApiError` from `../api`).

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test tests/integration/invoicing-posting.test.ts tests/integration/invoicing-accounts.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/invoicing/posting.ts src/lib/server/invoicing/accounts.ts tests/integration/invoicing-posting.test.ts tests/integration/invoicing-accounts.test.ts
git commit -m "feat(app): add shared journal posting/reversal and account-type validation for invoicing"
```

---

## Task 4: Contacts — schema, service, routes, list page

**Files:**
- Create: `src/lib/schemas/contact.ts`
- Create: `src/lib/server/invoicing/contacts.ts`
- Create: `src/routes/api/invoicing/contacts/+server.ts`
- Create: `src/routes/api/invoicing/contacts/[id]/+server.ts`
- Create: `src/routes/(app)/invoicing/contacts/+page.server.ts`
- Create: `src/routes/(app)/invoicing/contacts/+page.svelte`
- Test: `tests/unit/invoicing-contact-schema.test.ts`
- Test: `tests/integration/invoicing-contacts.test.ts`

**Interfaces:**
- Consumes: `contacts` (Task 1). `requireRole`/`requirePageRole` (existing, `$lib/server/rbac`). `isUniqueViolation` (existing, `$lib/server/db/errors`).
- Produces: `CreateContactInput`/`UpdateContactInput` (Zod), `createContact(companyId, input): Promise<{id}>`, `updateContact(companyId, contactId, input): Promise<void>`, `deactivateContact(companyId, contactId): Promise<void>`, `listContacts(companyId, opts?: {kind?: 'CUSTOMER'|'VENDOR'}): Promise<ContactRow[]>`, `getContact(companyId, contactId): Promise<ContactRow>` — consumed by Tasks 5 and 11 (Invoice/PO contact pickers both filter `listContacts` by kind).

- [ ] **Step 1: Write the failing schema test**

```ts
// tests/unit/invoicing-contact-schema.test.ts
import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreateContactInput } from '$lib/schemas/contact';

test('name and kind are required, in Indonesian', () => {
	const e = fieldErrors(CreateContactInput, {});
	expect(e.name).toBe('Nama wajib diisi');
	expect(e.kind).toBeDefined();
});

test('valid minimal input passes', () => {
	expect(fieldErrors(CreateContactInput, { kind: 'CUSTOMER', name: 'PT Mitra' })).toEqual({});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/invoicing-contact-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/schemas/contact.ts`**

```ts
export const CreateContactInput = z.object({
	kind: z.enum(['CUSTOMER', 'VENDOR', 'BOTH'], { error: 'Jenis kontak wajib dipilih' }),
	name: requiredText('Nama', 200),
	npwp: optionalText('NPWP', 20),
	address: optionalText('Alamat', 500),
	email: z.string().trim().max(200).email('Format email tidak valid').optional().or(z.literal('')),
	phone: optionalText('Telepon', 30)
});
export type CreateContactInput = z.infer<typeof CreateContactInput>;
export const UpdateContactInput = CreateContactInput.partial().extend({ isActive: z.boolean().optional() });
export type UpdateContactInput = z.infer<typeof UpdateContactInput>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/invoicing-contact-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing integration test**

```ts
// tests/integration/invoicing-contacts.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { createContact, listContacts, updateContact, deactivateContact } from '../../src/lib/server/invoicing/contacts';
import { makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('creates, lists filtered by kind, updates, and deactivates a contact', async () => {
	const { companyId } = await makeCompany();
	const { id } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Pelanggan' });
	await createContact(companyId, { kind: 'VENDOR', name: 'PT Vendor' });
	await createContact(companyId, { kind: 'BOTH', name: 'PT Keduanya' });

	expect((await listContacts(companyId, { kind: 'CUSTOMER' })).map((c) => c.name).sort()).toEqual(['PT Keduanya', 'PT Pelanggan']);
	expect((await listContacts(companyId, { kind: 'VENDOR' })).map((c) => c.name).sort()).toEqual(['PT Keduanya', 'PT Vendor']);

	await updateContact(companyId, id, { name: 'PT Pelanggan Baru' });
	expect((await listContacts(companyId)).find((c) => c.id === id)?.name).toBe('PT Pelanggan Baru');

	await deactivateContact(companyId, id);
	expect((await listContacts(companyId)).find((c) => c.id === id)?.isActive).toBe(false);
});

test('contacts are scoped per company', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	await createContact(a.companyId, { kind: 'CUSTOMER', name: 'Only in A' });
	expect(await listContacts(b.companyId)).toEqual([]);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-contacts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/lib/server/invoicing/contacts.ts`**

Straightforward CRUD against `contacts`, scoped by `companyId` on every query. `listContacts(companyId, opts)` filters `eq(contacts.companyId, companyId)` plus, if `opts?.kind` given, `or(eq(contacts.kind, opts.kind), eq(contacts.kind, 'BOTH'))`. `deactivateContact` sets `isActive: false` (no in-use check needed — a contact referenced by a historical invoice/PO can still be deactivated, unlike an account).

- [ ] **Step 8: Implement the two routes**

`src/routes/api/invoicing/contacts/+server.ts`: `GET` → `requireRole(event, 'viewer')`, optional `?kind=` query param, returns `{ contacts: await listContacts(...) }`; `POST` → `requireRole(event, 'accountant')`, `parseJson(event.request, CreateContactInput)`, `createContact`.
`src/routes/api/invoicing/contacts/[id]/+server.ts`: `PUT` → `requireRole(event, 'accountant')`, `updateContact`; `DELETE` → `requireRole(event, 'accountant')`, `deactivateContact` (deactivating, not a hard delete — mirrors `deactivateAccount`'s naming, but exposed as `DELETE` on this route since there's no "reactivate" UI need yet; if the implementer finds that confusing, exposing it as `PATCH {isActive:false}` via the same `PUT` route is an acceptable equivalent — pick one and be consistent).

- [ ] **Step 9: Implement the list page**

`+page.server.ts`: `requirePageRole(event, 'viewer')`, loads `listContacts(ctx.companyId)`. `+page.svelte`: `DataTable` (columns: Nama, Jenis, NPWP, Email, Telepon, Aktif) plus an inline create form (mirrors `settings/accounts/+page.svelte`'s Card-based inline-add pattern) shown only when `roleAtLeast(data.ctx.role, 'accountant')`.

- [ ] **Step 10: Run tests to verify they pass**

Run: `bun test tests/integration/invoicing-contacts.test.ts`
Expected: PASS.

- [ ] **Step 11: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/lib/schemas/contact.ts src/lib/server/invoicing/contacts.ts src/routes/api/invoicing/contacts "src/routes/(app)/invoicing/contacts" tests/unit/invoicing-contact-schema.test.ts tests/integration/invoicing-contacts.test.ts
git commit -m "feat(app): add Contacts (customer/vendor) master data"
```

---

## Task 5: Invoice — schema, create (Draft), new-invoice page

**Files:**
- Create: `src/lib/schemas/invoice.ts`
- Create: `src/lib/server/invoicing/invoices.ts`
- Create: `src/routes/api/invoicing/invoices/+server.ts`
- Create: `src/routes/(app)/invoicing/invoices/+page.server.ts`
- Create: `src/routes/(app)/invoicing/invoices/+page.svelte`
- Create: `src/routes/(app)/invoicing/invoices/new/+page.server.ts`
- Create: `src/routes/(app)/invoicing/invoices/new/+page.svelte`
- Test: `tests/unit/invoicing-invoice-schema.test.ts`
- Test: `tests/integration/invoicing-invoice-create.test.ts`

**Interfaces:**
- Consumes: `assertAccountOfType` (Task 3). `listContacts` (Task 4). `moneyString`/`isoDate`/`requiredId`/`requiredText`/`optionalText` (existing, `$lib/schemas/common`).
- Produces:
  ```ts
  export interface InvoiceLineInput { description: string; quantity: string; unitPrice: string; revenueAccountId: string }
  export async function createInvoice(companyId: string, userId: string, input: { contactId: string; issueDate: string; receivableAccountId: string; taxRate?: string; taxAccountId?: string; notes?: string; lines: InvoiceLineInput[] }): Promise<{ id: string }>
  export async function listInvoices(companyId: string): Promise<InvoiceListRow[]>
  export async function getInvoice(companyId: string, invoiceId: string): Promise<InvoiceDetail>
  ```
  Tasks 6, 7, 9, 10 all extend this same file (`invoices.ts`) with the transition functions; this task only adds `createInvoice`/`listInvoices`/`getInvoice`.

- [ ] **Step 1: Write the failing schema test**

```ts
// tests/unit/invoicing-invoice-schema.test.ts
import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreateInvoiceInput } from '$lib/schemas/invoice';

const UUID = '00000000-0000-4000-8000-000000000000';

test('requires contact, issue date, receivable account, and at least one line', () => {
	const e = fieldErrors(CreateInvoiceInput, { lines: [] });
	expect(e.contactId).toBeDefined();
	expect(e.issueDate).toBeDefined();
	expect(e.receivableAccountId).toBeDefined();
	expect(e.lines).toBe('Isi minimal satu baris');
});

test('a line with a zero amount or missing account is rejected', () => {
	const base = { contactId: UUID, issueDate: '2026-10-01', receivableAccountId: UUID };
	expect(fieldErrors(CreateInvoiceInput, { ...base, lines: [{ description: 'Jasa', quantity: '1', unitPrice: '0' }] }).lines).toBeDefined();
});

test('taxRate without taxAccountId is rejected', () => {
	const base = { contactId: UUID, issueDate: '2026-10-01', receivableAccountId: UUID, lines: [{ description: 'Jasa', quantity: '1', unitPrice: '10000', revenueAccountId: UUID }] };
	expect(fieldErrors(CreateInvoiceInput, { ...base, taxRate: '11' }).taxAccountId).toBeDefined();
	expect(fieldErrors(CreateInvoiceInput, { ...base, taxRate: '11', taxAccountId: UUID })).toEqual({});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/invoicing-invoice-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/schemas/invoice.ts`**

```ts
const positiveAmount = moneyString.refine((v) => Number(v) > 0, 'Jumlah harus lebih dari 0');
export const InvoiceLineInput = z.object({
	description: requiredText('Keterangan', 200),
	quantity: positiveAmount,
	unitPrice: positiveAmount,
	revenueAccountId: requiredId('Akun pendapatan')
});
export const CreateInvoiceInput = z
	.object({
		contactId: requiredId('Pelanggan'),
		issueDate: isoDate,
		receivableAccountId: requiredId('Akun piutang usaha'),
		taxRate: z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Tarif PPN tidak valid').optional(),
		taxAccountId: requiredId('Akun PPN').optional(),
		notes: optionalText('Catatan', 500),
		lines: z.array(InvoiceLineInput).min(1, 'Isi minimal satu baris')
	})
	.refine((v) => !v.taxRate || Number(v.taxRate) === 0 || !!v.taxAccountId, { message: 'Akun PPN wajib diisi kalau tarif PPN diisi', path: ['taxAccountId'] });
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInput>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/invoicing-invoice-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing integration test**

```ts
// tests/integration/invoicing-invoice-create.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { invoices, invoiceLines, contacts } from '../../src/lib/server/db/schema';
import { createInvoice, getInvoice } from '../../src/lib/server/invoicing/invoices';
import { makeCompany, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('creates a Draft invoice with no number and no journal, with subtotal/tax/total computed server-side', async () => {
	const { companyId } = await makeCompany();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const tax = await accountIdByCode(companyId, '2-1005');

	const { id } = await createInvoice(companyId, 'user-id-placeholder', {
		contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, taxRate: '11', taxAccountId: tax,
		lines: [{ description: 'Jasa konsultasi', quantity: '2', unitPrice: '500000', revenueAccountId: revenue }]
	});
	const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
	expect(invoice).toMatchObject({ status: 'DRAFT', invoiceNo: null, subtotal: '1000000.00', taxAmount: '110000.00', total: '1110000.00' });
	const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
	expect(lines[0]).toMatchObject({ amount: '1000000.00' });

	const detail = await getInvoice(companyId, id);
	expect(detail.status).toBe('DRAFT');
});

test('rejects a revenue account that is not actually a REVENUE-type account', async () => {
	const { companyId } = await makeCompany();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const expenseAccount = await accountIdByCode(companyId, '5-2010');
	await expect(
		createInvoice(companyId, 'user-id-placeholder', { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'x', quantity: '1', unitPrice: '1000', revenueAccountId: expenseAccount }] })
	).rejects.toMatchObject({ code: 'wrong_account_type' });
});
```

(Replace `'user-id-placeholder'` with a real `await makeUser()`'s `.id` — the placeholder is here only because `createdBy`'s nullability means the test could also pass `null`; use a real user id to match how every other test in this codebase does it.)

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-invoice-create.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `createInvoice`/`listInvoices`/`getInvoice` in `src/lib/server/invoicing/invoices.ts`**

`createInvoice`: validate `receivableAccountId` via `assertAccountOfType(db, companyId, input.receivableAccountId, 'ASSET')`, each line's `revenueAccountId` via `assertAccountOfType(db, companyId, l.revenueAccountId, 'REVENUE')`, `taxAccountId` (if present) via `assertLeafAccount` only (no type restriction — PPN accounts can be ASSET or LIABILITY depending on the CoA template, see spec). Compute each line's `amount = D(quantity).times(unitPrice)` (toMoney'd), `subtotal = sumMoney(lines.map(amount))`, `taxAmount = taxRate ? subtotal.times(taxRate).div(100) : 0` (toMoney'd), `total = subtotal.plus(taxAmount)`. Insert `invoices` row (`status: 'DRAFT'`, `invoiceNo: null`) then `invoiceLines` rows with `lineNo` 1..n, all inside one `db.transaction`. `listInvoices`/`getInvoice` are plain scoped `select`s (no transaction needed), `getInvoice` also loads its `invoiceLines` and throws `notFound('Invoice')` if absent.

- [ ] **Step 8: Implement the route and pages**

`src/routes/api/invoicing/invoices/+server.ts`: `GET` → `requireRole(event,'viewer')`, `listInvoices`; `POST` → `requireRole(event,'accountant')`, `parseJson(event.request, CreateInvoiceInput)`, `createInvoice(ctx.companyId, ctx.user.id, input)`, `json(result, {status:201})`.
List page (`invoicing/invoices/+page.server.ts`+`+page.svelte`): `requirePageRole(event,'viewer')`, `DataTable` (columns: No./Draft, Pelanggan, Tanggal, Total, Status), link to `/invoicing/invoices/new` shown when `accountant`+.
New-invoice page (`invoicing/invoices/new/+page.server.ts`+`+page.svelte`): `requirePageRole(event,'accountant')`, loads `listContacts(ctx.companyId, {kind:'CUSTOMER'})` and `listLeafAccounts` (existing, for the account pickers via `SearchSelect`+`accountOptions`); form posts to the API route above via `apiFetch`, redirects to `/invoicing/invoices/${res.id}` on success (the detail page itself is Task 6's job — a bare redirect target with no page yet is fine, Task 6 adds it).

- [ ] **Step 9: Run tests to verify they pass**

Run: `bun test tests/integration/invoicing-invoice-create.test.ts`
Expected: PASS.

- [ ] **Step 10: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/schemas/invoice.ts src/lib/server/invoicing/invoices.ts src/routes/api/invoicing/invoices "src/routes/(app)/invoicing/invoices" tests/unit/invoicing-invoice-schema.test.ts tests/integration/invoicing-invoice-create.test.ts
git commit -m "feat(app): add Invoice creation (Draft), list and new-invoice pages"
```

---

## Task 6: Invoice — send (posting) + detail page

**Files:**
- Modify: `src/lib/server/invoicing/invoices.ts`
- Create: `src/routes/api/invoicing/invoices/[id]/+server.ts`
- Create: `src/routes/api/invoicing/invoices/[id]/send/+server.ts`
- Create: `src/routes/(app)/invoicing/invoices/[id]/+page.server.ts`
- Create: `src/routes/(app)/invoicing/invoices/[id]/+page.svelte`
- Test: `tests/integration/invoicing-invoice-send.test.ts`

**Interfaces:**
- Consumes: `createInvoice`/`getInvoice` (Task 5). `postJournal` (Task 3). `nextDocumentNumber` (Task 2). `assertPeriodOpen` (existing).
- Produces: `export async function sendInvoice(companyId: string, userId: string, invoiceId: string, date: string): Promise<void>` — consumed by Task 9's cancel logic (to set up a SENT invoice to then cancel) and by Task 10 (PDF needs a non-Draft invoice to render meaningfully, though it works on Drafts too).

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/invoicing-invoice-send.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { invoices, journalEntries, journalLines } from '../../src/lib/server/db/schema';
import { createInvoice, sendInvoice } from '../../src/lib/server/invoicing/invoices';
import { makeCompany, makeUser, accountIdByCode, contacts as makeContact } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function draftInvoice(companyId: string) {
	const { contacts } = await import('../../src/lib/server/db/schema');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	return createInvoice(companyId, (await makeUser()).id, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000000', revenueAccountId: revenue }] });
}

test('sending assigns a sequential number and posts a balanced journal debiting the receivable', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await draftInvoice(companyId);

	await sendInvoice(companyId, u.id, id, '2026-10-05');

	const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
	expect(invoice).toMatchObject({ status: 'SENT', invoiceNo: 'INV-2026-0001' });
	const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.invoiceId, id) });
	expect(entry).toMatchObject({ entryDate: '2026-10-05', refNo: 'INV-2026-0001' });
	const lines = await db.select().from(journalLines).where(eq(journalLines.journalId, entry!.id));
	expect(lines.map((l) => [l.debit, l.credit]).sort()).toEqual([['0.00', '1000000.00'], ['1000000.00', '0.00']]);
});

test('a second invoice gets the next sequential number', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const first = await draftInvoice(companyId);
	const second = await draftInvoice(companyId);
	await sendInvoice(companyId, u.id, first.id, '2026-10-05');
	await sendInvoice(companyId, u.id, second.id, '2026-10-05');
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, second.id) }))?.invoiceNo).toBe('INV-2026-0002');
});

test('sending into a closed fiscal period is rejected', async () => {
	// Reuses the existing closing-lock mechanism: insert a fiscal_closings row covering the send date.
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await draftInvoice(companyId);
	const { fiscalClosings, accounts } = await import('../../src/lib/server/db/schema');
	const retained = await accountIdByCode(companyId, '3-1001');
	await db.insert(fiscalClosings).values({ companyId, periodStart: '2026-01-01', periodEnd: '2026-09-30', retainedEarningsAccountId: retained, closedBy: u.id });
	await expect(sendInvoice(companyId, u.id, id, '2026-09-15')).rejects.toMatchObject({ code: 'period_closed' });
});

test('sending an already-sent invoice is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await draftInvoice(companyId);
	await sendInvoice(companyId, u.id, id, '2026-10-05');
	await expect(sendInvoice(companyId, u.id, id, '2026-10-06')).rejects.toMatchObject({ code: 'invalid_status' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-invoice-send.test.ts`
Expected: FAIL — `sendInvoice` not exported.

- [ ] **Step 3: Implement `sendInvoice` in `src/lib/server/invoicing/invoices.ts`**

```ts
export async function sendInvoice(companyId: string, userId: string, invoiceId: string, date: string): Promise<void>
```

In a `db.transaction`: row-lock the company (`select id from companies where id = ${companyId} for update`), load the invoice + its lines (404 if absent, `ApiError(409, 'invalid_status', 'Invoice sudah bukan Draft')` if `status !== 'DRAFT'`), `assertPeriodOpen(tx, companyId, [date])`, assign `invoiceNo = await nextDocumentNumber(tx, companyId, 'INV', date.slice(0, 4))`, build lines: one `{accountId: receivableAccountId, debit: total, credit: '0.00'}` plus one `{accountId: revenueAccountId per line, debit:'0.00', credit: line.amount}` per invoice line, plus (if `taxAmount` > 0) `{accountId: taxAccountId, debit:'0.00', credit: taxAmount}`, call `postJournal(tx, {..., entryDate: date, refNo: invoiceNo, description: `Invoice ${invoiceNo}`, invoiceId})`, then `update(invoices).set({invoiceNo, status: 'SENT'})`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/integration/invoicing-invoice-send.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the routes and detail page**

`[id]/+server.ts`: `GET` → `requireRole(event,'viewer')`, `getInvoice`.
`[id]/send/+server.ts`: `POST` → `requireRole(event,'accountant')`, body `{date: isoDate}` (new tiny schema inline or in `invoice.ts`), `sendInvoice(ctx.companyId, ctx.user.id, parseId(event.params.id), input.date)`.
Detail page (`invoicing/invoices/[id]/+page.server.ts`+`+page.svelte`): `requirePageRole(event,'viewer')`, `withPageErrors(() => getInvoice(ctx.companyId, parseId(event.params.id)))`, shows lines/totals/status and a "Kirim" button (date field defaulting to today) visible when `status === 'DRAFT'` and `roleAtLeast(ctx.role,'accountant')`.

- [ ] **Step 6: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/invoicing/invoices.ts src/routes/api/invoicing/invoices "src/routes/(app)/invoicing/invoices" tests/integration/invoicing-invoice-send.test.ts
git commit -m "feat(app): post the invoice journal on Kirim, assign sequential invoice number"
```

---

## Task 7: Invoice — pay via bank + cancel (Draft delete and posted reversal)

**Files:**
- Modify: `src/lib/server/invoicing/invoices.ts`
- Create: `src/routes/api/invoicing/invoices/[id]/pay/+server.ts`
- Create: `src/routes/api/invoicing/invoices/[id]/cancel/+server.ts`
- Modify: `src/routes/(app)/invoicing/invoices/[id]/+page.svelte`
- Test: `tests/integration/invoicing-invoice-pay-cancel.test.ts`

**Interfaces:**
- Consumes: `sendInvoice` (Task 6). `reverseJournalEntries` (Task 3). `companies.bankAccountId` (existing).
- Produces: `export async function payInvoiceByBank(companyId: string, userId: string, invoiceId: string, date: string): Promise<void>`, `export async function cancelInvoice(companyId: string, userId: string, invoiceId: string): Promise<void>` (the Draft-delete and posted-reversal branches both live in this one function) — Task 9 extends `cancelInvoice`'s posted-reversal branch to also unwind an advance-receipt payment, and adds `payInvoiceByAdvanceReceipt` alongside this task's `payInvoiceByBank`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/invoicing-invoice-pay-cancel.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { invoices, journalEntries } from '../../src/lib/server/db/schema';
import { createInvoice, sendInvoice, payInvoiceByBank, cancelInvoice } from '../../src/lib/server/invoicing/invoices';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function sentInvoice(companyId: string, userId: string) {
	const { contacts } = await import('../../src/lib/server/db/schema');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const { id } = await createInvoice(companyId, userId, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000000', revenueAccountId: revenue }] });
	await sendInvoice(companyId, userId, id, '2026-10-05');
	return id;
}

test('paying by bank debits the bank account and credits the receivable, marks PAID', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	await payInvoiceByBank(companyId, u.id, id, '2026-10-10');
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('PAID');
	const entries = await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id));
	expect(entries).toHaveLength(2); // Kirim + Lunas
});

test('paying into a closed fiscal period is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	const { fiscalClosings } = await import('../../src/lib/server/db/schema');
	const retained = await accountIdByCode(companyId, '3-1001');
	await db.insert(fiscalClosings).values({ companyId, periodStart: '2026-01-01', periodEnd: '2026-09-30', retainedEarningsAccountId: retained, closedBy: u.id });
	await expect(payInvoiceByBank(companyId, u.id, id, '2026-09-15')).rejects.toMatchObject({ code: 'period_closed' });
});

test('cancelling a Draft invoice just changes status, no journal at all', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contacts } = await import('../../src/lib/server/db/schema');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const { id } = await createInvoice(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'x', quantity: '1', unitPrice: '1000', revenueAccountId: revenue }] });
	await cancelInvoice(companyId, u.id, id);
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('CANCELLED');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id))).toHaveLength(0);
});

test('cancelling a SENT invoice reverses its posting journal', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	await cancelInvoice(companyId, u.id, id);
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('CANCELLED');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id))).toHaveLength(2); // original + reversal
});

test('cancelling a PAID invoice reverses both its posting and payment journals', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	await payInvoiceByBank(companyId, u.id, id, '2026-10-10');
	await cancelInvoice(companyId, u.id, id);
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id))).toHaveLength(4); // 2 originals + 2 reversals
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-invoice-pay-cancel.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement `payInvoiceByBank` and `cancelInvoice` in `invoices.ts`**

`payInvoiceByBank`: in a `db.transaction`, lock company, load invoice (404 if absent, `invalid_status` if not `SENT`), `assertPeriodOpen(tx, companyId, [date])`, `postJournal(tx, {entryDate: date, refNo: invoice.invoiceNo!, description: `Pelunasan ${invoice.invoiceNo}`, lines: [{accountId: company.bankAccountId, debit: total, credit:'0.00'}, {accountId: invoice.receivableAccountId, debit:'0.00', credit: total}], invoiceId})`, `update(invoices).set({status:'PAID'})`.

`cancelInvoice`: load invoice; if `status === 'DRAFT'`, just `update(invoices).set({status:'CANCELLED'})` (no transaction-with-lock needed — nothing to reverse). Otherwise (`SENT`/`PAID`), in a `db.transaction` with company lock, `reverseJournalEntries(tx, {companyId, createdBy: userId, invoiceId, descriptionPrefix: 'Pembalikan'})` then `update(invoices).set({status:'CANCELLED'})`. `CANCELLED`/already-`CANCELLED` invoices reject re-cancellation with `invalid_status`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/integration/invoicing-invoice-pay-cancel.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the routes and detail-page buttons**

`[id]/pay/+server.ts`: `POST` → `requireRole(event,'accountant')`, body `{date, method: 'BANK'}` (Task 9 extends this to also accept `method:'ADVANCE_RECEIPT'`), calls `payInvoiceByBank`.
`[id]/cancel/+server.ts`: `POST` → role depends on whether the invoice is still Draft or already posted (per spec: Draft cancel = `accountant`, posted cancel = `admin`) — read the invoice's current status first with a `viewer`-level fetch, then call `requireRole(event, invoice.status === 'DRAFT' ? 'accountant' : 'admin')` before calling `cancelInvoice`.
Detail page: add "Bayar dari Bank" (shown when `SENT`, date field default today) and "Batalkan" (shown when not already `CANCELLED`) buttons, gated by the same role logic as the route.

- [ ] **Step 6: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/invoicing/invoices.ts src/routes/api/invoicing/invoices "src/routes/(app)/invoicing/invoices" tests/integration/invoicing-invoice-pay-cancel.test.ts
git commit -m "feat(app): add invoice bank payment and cancel-with-reversal"
```

---

## Task 8: Advance Receipt — schema, service, routes, pages

**Files:**
- Create: `src/lib/schemas/advance-receipt.ts`
- Create: `src/lib/server/invoicing/advance-receipts.ts`
- Create: `src/routes/api/invoicing/advance-receipts/+server.ts`
- Create: `src/routes/api/invoicing/advance-receipts/[id]/+server.ts`
- Create: `src/routes/api/invoicing/advance-receipts/[id]/cancel/+server.ts`
- Create: `src/routes/(app)/invoicing/advance-receipts/+page.server.ts` + `+page.svelte`
- Create: `src/routes/(app)/invoicing/advance-receipts/new/+page.server.ts` + `+page.svelte`
- Create: `src/routes/(app)/invoicing/advance-receipts/[id]/+page.server.ts` + `+page.svelte`
- Test: `tests/unit/invoicing-advance-receipt-schema.test.ts`
- Test: `tests/integration/invoicing-advance-receipts.test.ts`

**Interfaces:**
- Consumes: `postJournal`/`reverseJournalEntries` (Task 3). `nextDocumentNumber` (Task 2). `listContacts` (Task 4). `companies.bankAccountId` (existing).
- Produces: `export async function createAdvanceReceipt(companyId: string, userId: string, input: {contactId: string; receiptDate: string; amount: string; deferredRevenueAccountId: string}): Promise<{id: string}>`, `export async function cancelAdvanceReceipt(companyId: string, userId: string, id: string): Promise<void>`, `export async function getAdvanceReceipt(companyId: string, id: string): Promise<AdvanceReceiptDetail>`, `export async function listAdvanceReceipts(companyId: string): Promise<AdvanceReceiptListRow[]>` — Task 9 imports `getAdvanceReceipt` and reads/writes `advanceReceipts.status`/`appliedToInvoiceId` directly for the apply-to-invoice flow.

- [ ] **Step 1: Write the failing schema test**

```ts
// tests/unit/invoicing-advance-receipt-schema.test.ts
import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreateAdvanceReceiptInput } from '$lib/schemas/advance-receipt';

test('requires contact, date, a positive amount, and an account', () => {
	const e = fieldErrors(CreateAdvanceReceiptInput, { amount: '0' });
	expect(e.contactId).toBeDefined();
	expect(e.receiptDate).toBeDefined();
	expect(e.amount).toBe('Jumlah harus lebih dari 0');
	expect(e.deferredRevenueAccountId).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/invoicing-advance-receipt-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/schemas/advance-receipt.ts`**

```ts
export const CreateAdvanceReceiptInput = z.object({
	contactId: requiredId('Pelanggan'),
	receiptDate: isoDate,
	amount: moneyString.refine((v) => Number(v) > 0, 'Jumlah harus lebih dari 0'),
	deferredRevenueAccountId: requiredId('Akun pendapatan diterima dimuka')
});
export type CreateAdvanceReceiptInput = z.infer<typeof CreateAdvanceReceiptInput>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/invoicing-advance-receipt-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing integration test**

```ts
// tests/integration/invoicing-advance-receipts.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { advanceReceipts, journalEntries, journalLines, contacts } from '../../src/lib/server/db/schema';
import { createAdvanceReceipt, cancelAdvanceReceipt } from '../../src/lib/server/invoicing/advance-receipts';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('creating posts immediately: Debit Bank / Credit deferred-revenue, dated receiptDate, numbered UM-year-NNNN', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const deferred = await accountIdByCode(companyId, '2-1007');

	const { id } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '5000000', deferredRevenueAccountId: deferred });

	const receipt = await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, id) });
	expect(receipt).toMatchObject({ status: 'ACTIVE', receiptNo: 'UM-2026-0001', amount: '5000000.00' });
	const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.advanceReceiptId, id) });
	expect(entry).toMatchObject({ entryDate: '2026-10-02', refNo: 'UM-2026-0001' });
	const lines = await db.select().from(journalLines).where(eq(journalLines.journalId, entry!.id));
	expect(lines.map((l) => [l.accountId, l.debit, l.credit]).sort()).toEqual([[bankAccountId, '5000000.00', '0.00'], [deferred, '0.00', '5000000.00']].sort());
});

test('recording a receipt dated into a closed fiscal period is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const deferred = await accountIdByCode(companyId, '2-1007');
	const { fiscalClosings } = await import('../../src/lib/server/db/schema');
	const retained = await accountIdByCode(companyId, '3-1001');
	await db.insert(fiscalClosings).values({ companyId, periodStart: '2026-01-01', periodEnd: '2026-09-30', retainedEarningsAccountId: retained, closedBy: u.id });
	await expect(createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-09-15', amount: '1000000', deferredRevenueAccountId: deferred })).rejects.toMatchObject({ code: 'period_closed' });
});

test('cancelling an ACTIVE receipt reverses its journal and marks it REFUNDED', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const deferred = await accountIdByCode(companyId, '2-1007');
	const { id } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });

	await cancelAdvanceReceipt(companyId, u.id, id);

	expect((await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, id) }))?.status).toBe('REFUNDED');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.advanceReceiptId, id))).toHaveLength(2);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-advance-receipts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `advance-receipts.ts`**

`createAdvanceReceipt`: in a `db.transaction`, lock company, `assertAccountOfType(tx, companyId, deferredRevenueAccountId, 'LIABILITY')`, `assertPeriodOpen(tx, companyId, [receiptDate])`, `receiptNo = await nextDocumentNumber(tx, companyId, 'UM', receiptDate.slice(0,4))`, insert `advanceReceipts` row (`status: 'ACTIVE'`), `postJournal(tx, {entryDate: receiptDate, refNo: receiptNo, description: `Uang muka ${receiptNo}`, lines: [{accountId: company.bankAccountId, debit: amount, credit:'0.00'}, {accountId: deferredRevenueAccountId, debit:'0.00', credit: amount}], advanceReceiptId: row.id})`.

`cancelAdvanceReceipt`: load receipt, reject (`invalid_status`) if not `ACTIVE` (per spec: can't cancel one already `APPLIED` to an invoice — the invoice must be cancelled first, which Task 9 makes release it back to `ACTIVE`). In a `db.transaction` with company lock, `reverseJournalEntries(tx, {companyId, createdBy: userId, advanceReceiptId: id, descriptionPrefix: 'Pembalikan'})` (Task 3's signature already accepts `advanceReceiptId`; this task's test is what first exercises that branch), `update(advanceReceipts).set({status:'REFUNDED'})`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test tests/integration/invoicing-advance-receipts.test.ts`
Expected: PASS.

- [ ] **Step 9: Implement routes and pages**

Routes mirror Task 4/6's shape (`GET`/`POST` list+create, `GET` detail, `POST cancel`), all under `/api/invoicing/advance-receipts`. Pages mirror Task 5/6's shape (list, new — single-step form since there's no Draft stage, detail showing status + a "Batalkan" button when `ACTIVE`), all `requirePageRole` at `viewer` for read, `accountant` for create, and (per spec: cancelling a posted document needs `admin`) `admin` for cancel.

- [ ] **Step 10: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/schemas/advance-receipt.ts src/lib/server/invoicing/advance-receipts.ts src/routes/api/invoicing/advance-receipts "src/routes/(app)/invoicing/advance-receipts" tests/unit/invoicing-advance-receipt-schema.test.ts tests/integration/invoicing-advance-receipts.test.ts
git commit -m "feat(app): add Advance Receipt (Uang Muka), posted immediately on creation"
```

---

## Task 9: Invoice — pay via Advance Receipt + cancel unwinds it

**Files:**
- Modify: `src/lib/server/invoicing/invoices.ts`
- Modify: `src/routes/api/invoicing/invoices/[id]/pay/+server.ts`
- Modify: `src/routes/(app)/invoicing/invoices/[id]/+page.svelte`
- Test: `tests/integration/invoicing-invoice-pay-advance.test.ts`

**Interfaces:**
- Consumes: `advanceReceipts` table, `getAdvanceReceipt` (Task 8). `sendInvoice`/`cancelInvoice` (Tasks 6-7).
- Produces: `export async function payInvoiceByAdvanceReceipt(companyId: string, userId: string, invoiceId: string, advanceReceiptId: string, date: string): Promise<void>` — nothing later depends on this; it's the deliverable, along with `cancelInvoice`'s extended behavior.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/invoicing-invoice-pay-advance.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { invoices, advanceReceipts, contacts, journalEntries } from '../../src/lib/server/db/schema';
import { createInvoice, sendInvoice, payInvoiceByAdvanceReceipt, cancelInvoice } from '../../src/lib/server/invoicing/invoices';
import { createAdvanceReceipt } from '../../src/lib/server/invoicing/advance-receipts';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup(companyId: string, userId: string) {
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const deferred = await accountIdByCode(companyId, '2-1007');
	const { id: invoiceId } = await createInvoice(companyId, userId, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000000', revenueAccountId: revenue }] });
	await sendInvoice(companyId, userId, invoiceId, '2026-10-01');
	return { contact, invoiceId, receivable, deferred };
}

test('an exact-match advance receipt pays the invoice: Debit deferred-revenue / Credit receivable', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId, deferred } = await setup(companyId, u.id);
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });

	await payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10');

	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) }))?.status).toBe('PAID');
	expect((await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, receiptId) }))).toMatchObject({ status: 'APPLIED', appliedToInvoiceId: invoiceId });
});

test('a mismatched amount is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId, deferred } = await setup(companyId, u.id);
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '999999', deferredRevenueAccountId: deferred });
	await expect(payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10')).rejects.toMatchObject({ code: 'amount_mismatch' });
});

test('a receipt belonging to a different contact is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { invoiceId, deferred } = await setup(companyId, u.id);
	const [otherContact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT Lain' }).returning();
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: otherContact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });
	await expect(payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10')).rejects.toMatchObject({ code: 'contact_mismatch' });
});

test('cancelling an invoice paid via an advance receipt releases the receipt back to ACTIVE', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId, deferred } = await setup(companyId, u.id);
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });
	await payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10');

	await cancelInvoice(companyId, u.id, invoiceId);

	expect((await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, receiptId) }))).toMatchObject({ status: 'ACTIVE', appliedToInvoiceId: null });
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, invoiceId))).toHaveLength(4); // send + pay-via-advance + 2 reversals
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-invoice-pay-advance.test.ts`
Expected: FAIL — `payInvoiceByAdvanceReceipt` not exported.

- [ ] **Step 3: Implement `payInvoiceByAdvanceReceipt` in `invoices.ts`**

In a `db.transaction`, lock company, load invoice (`invalid_status` if not `SENT`) and the advance receipt (404 if absent, `ApiError(409,'invalid_status','Uang muka ini sudah tidak aktif')` if not `ACTIVE`). Validate `receipt.contactId === invoice.contactId` else `ApiError(422,'contact_mismatch', 'Uang muka ini milik kontak yang berbeda dari invoice')`; validate `D(receipt.amount).eq(invoice.total)` else `ApiError(422,'amount_mismatch', 'Jumlah uang muka tidak sama dengan total invoice')`. `assertPeriodOpen(tx, companyId, [date])`. `postJournal(tx, {entryDate: date, refNo: invoice.invoiceNo!, description: `Pelunasan ${invoice.invoiceNo} via ${receipt.receiptNo}`, lines: [{accountId: receipt.deferredRevenueAccountId, debit: invoice.total, credit:'0.00'}, {accountId: invoice.receivableAccountId, debit:'0.00', credit: invoice.total}], invoiceId, advanceReceiptId: receipt.id})` (this single journal entry sets BOTH back-link columns — confirm `postJournal`'s signature from Task 3 accepts passing more than one of `invoiceId`/`purchaseOrderId`/`advanceReceiptId` simultaneously; if Task 3 only inserted whichever single one was passed, this is the same code path, just supplying two fields at once — no change needed to `postJournal` itself). `update(invoices).set({status:'PAID', paidViaAdvanceReceiptId: receipt.id})`. `update(advanceReceipts).set({status:'APPLIED', appliedToInvoiceId: invoiceId})`.

- [ ] **Step 4: Extend `cancelInvoice`'s posted-reversal branch**

After `reverseJournalEntries`, check `invoice.paidViaAdvanceReceiptId`: if set, `update(advanceReceipts).set({status:'ACTIVE', appliedToInvoiceId: null}).where(eq(advanceReceipts.id, invoice.paidViaAdvanceReceiptId))` inside the same transaction, before committing.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/integration/invoicing-invoice-pay-advance.test.ts`
Expected: PASS.

- [ ] **Step 6: Extend the pay route and detail-page UI**

`[id]/pay/+server.ts`: accept `method: 'BANK' | 'ADVANCE_RECEIPT'`, when `ADVANCE_RECEIPT` also require `advanceReceiptId` in the body, branch to `payInvoiceByAdvanceReceipt`.
Detail page: "Terapkan Uang Muka" button/option alongside "Bayar dari Bank" when `status === 'SENT'`, offering a picker of the invoice's contact's `ACTIVE` advance receipts (fetch via `/api/invoicing/advance-receipts?contactId=...&status=ACTIVE` — add this filter to Task 8's list route if not already present, or filter client-side from the full list; either is acceptable).

- [ ] **Step 7: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/invoicing/invoices.ts src/routes/api/invoicing/invoices "src/routes/(app)/invoicing/invoices" tests/integration/invoicing-invoice-pay-advance.test.ts
git commit -m "feat(app): pay invoice via advance receipt, and unwind it on cancel"
```

---

## Task 10: Shared PDF helper + Invoice PDF

**Files:**
- Create: `src/lib/server/invoicing/pdf.ts`
- Create: `src/routes/api/invoicing/invoices/[id]/pdf/+server.ts`
- Modify: `src/routes/(app)/invoicing/invoices/[id]/+page.svelte`
- Test: `tests/integration/invoicing-invoice-pdf.test.ts`

**Interfaces:**
- Consumes: `createPdfDocument`/`finishPdf`/`pdfResponse`/`drawLetterhead`/`getCompanyLetterheadData` (existing, unmodified, `$lib/server/reports/pdf-scaffold` and `pdf-letterhead`). `getInvoice` (Task 5).
- Produces: `export function drawDocumentPdf(doc: PDFKit.PDFDocument, y: number, opts: { contact: {name,address,npwp}, lines: {description,quantity,unitPrice,amount}[], subtotal, taxRate, taxAmount, total, notes, statusLabel }): void` — consumed as-is by Task 12's Purchase Order PDF route (identical document shape, different title/number/contact-role, per spec: the printed document never shows internal GL account codes).

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/invoicing-invoice-pdf.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/invoicing/invoices/[id]/pdf/+server';
import { createInvoice, sendInvoice } from '../../src/lib/server/invoicing/invoices';
import { db } from '../../src/lib/server/db';
import { contacts } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser, accountIdByCode, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function textOf(res: Response): Promise<string> {
	const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
	return (await parser.getText()).text;
}

test('PDF contains the contact name, invoice number, line description, and total', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT Pelanggan Uji' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const { id } = await createInvoice(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'Jasa konsultasi', quantity: '1', unitPrice: '1500000', revenueAccountId: revenue }] });
	await sendInvoice(companyId, u.id, id, '2026-10-01');

	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/invoices/${id}/pdf`, params: { id } }) as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('application/pdf');
	const text = await textOf(res);
	expect(text).toContain('PT Pelanggan Uji');
	expect(text).toContain('INV-2026-0001');
	expect(text).toContain('Jasa konsultasi');
	expect(text).toContain('1.500.000,00');
});

test('no company context is a 401', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/invoicing/invoices/x/pdf', params: { id: 'x' } }) as never);
	expect(res.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-invoice-pdf.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement `drawDocumentPdf` in `src/lib/server/invoicing/pdf.ts`**

A pure drawing function: at the given starting `y`, draw the contact's name/address/NPWP block, then a table (Keterangan | Qty | Harga Satuan | Jumlah) one row per line (money via `formatIdr`, `{lineBreak:false}` on every cell per the Export feature's established fix for this exact pdfkit pitfall), then Subtotal/PPN (if `taxRate`)/Total rows, then `notes` (if present) and `statusLabel`. Does not call `createPdfDocument`/`finishPdf`/`pdfResponse` itself — those are the route's job, exactly like Export's PDF routes call `drawLetterhead` then their own table-drawing code then `finishPdf`.

- [ ] **Step 4: Implement the route**

`requireRole(event,'viewer')`, `getInvoice`, `getCompanyLetterheadData`, `createPdfDocument()`, `y = drawLetterhead(doc, company, 'INVOICE', `${invoice.invoiceNo ?? 'DRAFT'} — ${formatDate(invoice.issueDate)}`)`, `drawDocumentPdf(doc, y, {contact, lines: invoice.lines, subtotal: invoice.subtotal, taxRate: invoice.taxRate, taxAmount: invoice.taxAmount, total: invoice.total, notes: invoice.notes, statusLabel: <Indonesian label for invoice.status>})`, `pdfResponse(await finishPdf(doc), `invoice-${invoice.invoiceNo ?? invoice.id}.pdf`)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/integration/invoicing-invoice-pdf.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the "Unduh PDF" button into the detail page**

`<Button href="/api/invoicing/invoices/{data.invoice.id}/pdf">Unduh PDF</Button>` in the invoice detail page, same `href`-as-download-link pattern as the Export feature.

- [ ] **Step 7: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/invoicing/pdf.ts src/routes/api/invoicing/invoices "src/routes/(app)/invoicing/invoices" tests/integration/invoicing-invoice-pdf.test.ts
git commit -m "feat(app): add shared invoicing PDF renderer and Invoice PDF download"
```

---

## Task 11: Purchase Order — schema, create (Draft), issue, new/list pages

**Files:**
- Create: `src/lib/schemas/purchase-order.ts`
- Create: `src/lib/server/invoicing/purchase-orders.ts`
- Create: `src/routes/api/invoicing/purchase-orders/+server.ts`
- Create: `src/routes/api/invoicing/purchase-orders/[id]/+server.ts`
- Create: `src/routes/api/invoicing/purchase-orders/[id]/issue/+server.ts`
- Create: `src/routes/(app)/invoicing/purchase-orders/+page.server.ts` + `+page.svelte`
- Create: `src/routes/(app)/invoicing/purchase-orders/new/+page.server.ts` + `+page.svelte`
- Create: `src/routes/(app)/invoicing/purchase-orders/[id]/+page.server.ts` + `+page.svelte`
- Test: `tests/unit/invoicing-po-schema.test.ts`
- Test: `tests/integration/invoicing-po-create-issue.test.ts`

**Interfaces:**
- Consumes: `assertAccountOfType` (Task 3). `nextDocumentNumber` (Task 2). `listContacts` (Task 4).
- Produces:
  ```ts
  export interface POLineInput { description: string; quantity: string; unitPrice: string; expenseAccountId: string }
  export async function createPurchaseOrder(companyId: string, userId: string, input: { contactId: string; issueDate: string; expectedDate?: string; payableAccountId: string; taxRate?: string; taxAccountId?: string; notes?: string; lines: POLineInput[] }): Promise<{ id: string }>
  export async function issuePurchaseOrder(companyId: string, userId: string, poId: string): Promise<void>
  export async function listPurchaseOrders(companyId: string): Promise<POListRow[]>
  export async function getPurchaseOrder(companyId: string, poId: string): Promise<PODetail>
  ```
  Task 12 extends this same file with `receivePurchaseOrder`/`cancelPurchaseOrder`.

- [ ] **Step 1: Write the failing schema test**

Mirrors Task 5 Step 1 exactly, substituting `payableAccountId`/`expenseAccountId` for `receivableAccountId`/`revenueAccountId` and adding an optional `expectedDate: isoDate.optional()` field with no validation beyond that.

```ts
// tests/unit/invoicing-po-schema.test.ts
import { expect, test } from 'bun:test';
import { fieldErrors } from '$lib/forms/validation';
import { CreatePurchaseOrderInput } from '$lib/schemas/purchase-order';

test('requires contact, issue date, payable account, and at least one line', () => {
	const e = fieldErrors(CreatePurchaseOrderInput, { lines: [] });
	expect(e.contactId).toBeDefined();
	expect(e.issueDate).toBeDefined();
	expect(e.payableAccountId).toBeDefined();
	expect(e.lines).toBe('Isi minimal satu baris');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/invoicing-po-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/schemas/purchase-order.ts`**

Same shape as `invoice.ts` (Task 5 Step 3) with `payableAccountId`/`expectedDate: isoDate.optional()`/lines using `expenseAccountId` instead of `revenueAccountId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/invoicing-po-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing integration test**

```ts
// tests/integration/invoicing-po-create-issue.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { purchaseOrders, journalEntries, contacts } from '../../src/lib/server/db/schema';
import { createPurchaseOrder, issuePurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('creates a Draft PO with no number; Issued assigns a number but posts no journal', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'VENDOR', name: 'PT Pemasok' }).returning();
	const payable = await accountIdByCode(companyId, '2-1001');
	const expense = await accountIdByCode(companyId, '5-2010');

	const { id } = await createPurchaseOrder(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', payableAccountId: payable, lines: [{ description: 'Sewa server', quantity: '1', unitPrice: '2000000', expenseAccountId: expense }] });
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }))).toMatchObject({ status: 'DRAFT', poNo: null, total: '2000000.00' });

	await issuePurchaseOrder(companyId, u.id, id);
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }))).toMatchObject({ status: 'ISSUED', poNo: 'PO-2026-0001' });
	expect(await db.select().from(journalEntries).where(eq(journalEntries.purchaseOrderId, id))).toHaveLength(0);
});

test('rejects an expense account that is not actually an EXPENSE-type account', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'VENDOR', name: 'PT Pemasok' }).returning();
	const payable = await accountIdByCode(companyId, '2-1001');
	const revenueAccount = await accountIdByCode(companyId, '4-1001');
	await expect(
		createPurchaseOrder(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', payableAccountId: payable, lines: [{ description: 'x', quantity: '1', unitPrice: '1000', expenseAccountId: revenueAccount }] })
	).rejects.toMatchObject({ code: 'wrong_account_type' });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test tests/integration/invoicing-po-create-issue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `createPurchaseOrder`/`issuePurchaseOrder`/`listPurchaseOrders`/`getPurchaseOrder` in `purchase-orders.ts`**

`createPurchaseOrder`: mirrors Task 5 Step 7's `createInvoice` with `assertAccountOfType(..., 'LIABILITY')` for `payableAccountId` and `'EXPENSE'` for each line's `expenseAccountId`. `issuePurchaseOrder`: in a `db.transaction` with company lock, load PO (`invalid_status` if not `DRAFT`), `poNo = await nextDocumentNumber(tx, companyId, 'PO', <issueDate's year>)`, `update(purchaseOrders).set({poNo, status:'ISSUED'})` — no `assertPeriodOpen` call and no journal, since issuing posts nothing (per spec).

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test tests/integration/invoicing-po-create-issue.test.ts`
Expected: PASS.

- [ ] **Step 9: Implement routes and pages**

Mirror Task 5's invoice routes/pages exactly, substituting PO's fields and contact filter `{kind:'VENDOR'}` for the contact picker.

- [ ] **Step 10: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/schemas/purchase-order.ts src/lib/server/invoicing/purchase-orders.ts src/routes/api/invoicing/purchase-orders "src/routes/(app)/invoicing/purchase-orders" tests/unit/invoicing-po-schema.test.ts tests/integration/invoicing-po-create-issue.test.ts
git commit -m "feat(app): add Purchase Order creation (Draft) and Issue (no posting)"
```

---

## Task 12: Purchase Order — receive (posting) + cancel + detail page + PDF

**Files:**
- Modify: `src/lib/server/invoicing/purchase-orders.ts`
- Create: `src/routes/api/invoicing/purchase-orders/[id]/receive/+server.ts`
- Create: `src/routes/api/invoicing/purchase-orders/[id]/cancel/+server.ts`
- Create: `src/routes/api/invoicing/purchase-orders/[id]/pdf/+server.ts`
- Modify: `src/routes/(app)/invoicing/purchase-orders/[id]/+page.svelte`
- Test: `tests/integration/invoicing-po-receive-cancel.test.ts`
- Test: `tests/integration/invoicing-po-pdf.test.ts`

**Interfaces:**
- Consumes: `postJournal`/`reverseJournalEntries` (Task 3). `issuePurchaseOrder`/`getPurchaseOrder` (Task 11). `drawDocumentPdf`/`createPdfDocument`/etc. (Task 10).
- Produces: `export async function receivePurchaseOrder(companyId: string, userId: string, poId: string, date: string): Promise<void>`, `export async function cancelPurchaseOrder(companyId: string, userId: string, poId: string): Promise<void>` — nothing later depends on these; final deliverables of the PO lifecycle.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/invoicing-po-receive-cancel.test.ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { purchaseOrders, journalEntries, journalLines, contacts } from '../../src/lib/server/db/schema';
import { createPurchaseOrder, issuePurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function issuedPO(companyId: string, userId: string) {
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'VENDOR', name: 'PT Pemasok' }).returning();
	const payable = await accountIdByCode(companyId, '2-1001');
	const expense = await accountIdByCode(companyId, '5-2010');
	const { id } = await createPurchaseOrder(companyId, userId, { contactId: contact.id, issueDate: '2026-10-01', payableAccountId: payable, lines: [{ description: 'Sewa server', quantity: '1', unitPrice: '2000000', expenseAccountId: expense }] });
	await issuePurchaseOrder(companyId, userId, id);
	return { id, payable, expense };
}

test('receiving posts Debit expense / Credit payable, dated the receive date', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id, payable, expense } = await issuedPO(companyId, u.id);
	await receivePurchaseOrder(companyId, u.id, id, '2026-10-15');
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }))?.status).toBe('RECEIVED');
	const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.purchaseOrderId, id) });
	expect(entry?.entryDate).toBe('2026-10-15');
	const lines = await db.select().from(journalLines).where(eq(journalLines.journalId, entry!.id));
	expect(lines.map((l) => [l.accountId, l.debit, l.credit]).sort()).toEqual([[expense, '2000000.00', '0.00'], [payable, '0.00', '2000000.00']].sort());
});

test('receiving into a closed fiscal period is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await issuedPO(companyId, u.id);
	const { fiscalClosings } = await import('../../src/lib/server/db/schema');
	const retained = await accountIdByCode(companyId, '3-1001');
	await db.insert(fiscalClosings).values({ companyId, periodStart: '2026-01-01', periodEnd: '2026-09-30', retainedEarningsAccountId: retained, closedBy: u.id });
	await expect(receivePurchaseOrder(companyId, u.id, id, '2026-09-15')).rejects.toMatchObject({ code: 'period_closed' });
});

test('cancelling an Issued (not yet Received) PO has nothing to reverse', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await issuedPO(companyId, u.id);
	await cancelPurchaseOrder(companyId, u.id, id);
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }))?.status).toBe('CANCELLED');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.purchaseOrderId, id))).toHaveLength(0);
});

test('cancelling a Received PO reverses its journal', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await issuedPO(companyId, u.id);
	await receivePurchaseOrder(companyId, u.id, id, '2026-10-15');
	await cancelPurchaseOrder(companyId, u.id, id);
	expect(await db.select().from(journalEntries).where(eq(journalEntries.purchaseOrderId, id))).toHaveLength(2);
});
```

```ts
// tests/integration/invoicing-po-pdf.test.ts
// Mirrors tests/integration/invoicing-invoice-pdf.test.ts exactly: create+issue a PO, GET its
// /pdf route, assert content-type application/pdf and that the extracted text contains the
// vendor's name, the PO number, and the line description.
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/integration/invoicing-po-receive-cancel.test.ts tests/integration/invoicing-po-pdf.test.ts`
Expected: FAIL — functions/route not found.

- [ ] **Step 3: Implement `receivePurchaseOrder`/`cancelPurchaseOrder` in `purchase-orders.ts`**

`receivePurchaseOrder`: mirrors Task 6's `sendInvoice` structure — lock company, load PO (`invalid_status` if not `ISSUED`), `assertPeriodOpen(tx, companyId, [date])`, lines: one `{accountId: expenseAccountId per line, debit: line.amount, credit:'0.00'}` plus (if tax) `{accountId: taxAccountId, debit: taxAmount, credit:'0.00'}`, plus one `{accountId: payableAccountId, debit:'0.00', credit: total}`, `postJournal(..., refNo: po.poNo!, purchaseOrderId: poId)`, `update(purchaseOrders).set({status:'RECEIVED'})`.

`cancelPurchaseOrder`: mirrors Task 7's `cancelInvoice` — `DRAFT`/`ISSUED` (nothing posted yet) just flips status; `RECEIVED` reverses via `reverseJournalEntries(tx, {purchaseOrderId: poId, ...})` first.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/integration/invoicing-po-receive-cancel.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the PDF route**

Mirrors Task 10's invoice PDF route exactly: `drawLetterhead(doc, company, 'PURCHASE ORDER', ...)`, `drawDocumentPdf(doc, y, {contact: vendor, lines: po.lines, ...})` (the shared helper from Task 10 takes the same shape regardless of document type, per its Interfaces block).

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test tests/integration/invoicing-po-pdf.test.ts`
Expected: PASS.

- [ ] **Step 7: Implement the `receive`/`cancel` routes and detail-page buttons**

Mirror Task 6/7's invoice routes (role: `receive` = `accountant`, `cancel` = `accountant` if not yet `RECEIVED` else `admin`, per spec).

- [ ] **Step 8: Run the full suite**

Run: `bun test tests/unit tests/integration`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/invoicing/purchase-orders.ts src/routes/api/invoicing/purchase-orders "src/routes/(app)/invoicing/purchase-orders" tests/integration/invoicing-po-receive-cancel.test.ts tests/integration/invoicing-po-pdf.test.ts
git commit -m "feat(app): add Purchase Order receive (posting), cancel, and PDF"
```

---

## Task 13: Navigation, sidebar icons, and an end-to-end e2e smoke test

**Files:**
- Modify: `src/lib/nav.ts`
- Modify: `src/lib/components/AppSidebar.svelte`
- Test: `tests/e2e/invoicing-smoke.spec.ts`

**Interfaces:**
- Consumes: all list pages from Tasks 4, 5, 8, 11 (`/invoicing/contacts`, `/invoicing/invoices`, `/invoicing/advance-receipts`, `/invoicing/purchase-orders`).
- Produces: nothing consumed by a later task — this is the last task.

- [ ] **Step 1: Add the new nav group**

In `src/lib/nav.ts`'s `NAV` array, insert a new group after `'Jurnal'`/`'Buku'` and before `'Laporan Keuangan'`: `{ label: 'Invoicing', items: [{label:'Kontak', href:'/invoicing/contacts', min:'viewer', icon:'contacts'}, {label:'Invoice', href:'/invoicing/invoices', min:'viewer', icon:'invoice'}, {label:'Uang Muka', href:'/invoicing/advance-receipts', min:'viewer', icon:'advance'}, {label:'Purchase Order', href:'/invoicing/purchase-orders', min:'viewer', icon:'po'}] }`.

- [ ] **Step 2: Add the matching icons in `AppSidebar.svelte`**

Import 4 new lucide icons (reasonable choices: `BookUser` for contacts, `Receipt` for invoice, `HandCoins` for advance, `ShoppingCart` for PO — if any of these exact names don't exist in the installed `@lucide/svelte` version, pick the closest available icon with a similar meaning; this is a cosmetic choice, not worth blocking on) and add 4 entries to the `ICONS` record: `contacts: BookUser, invoice: Receipt, advance: HandCoins, po: ShoppingCart`.

- [ ] **Step 3: Run the unit suite (covers `nav.test.ts`'s existing structural assertions, if any)**

Run: `bun test tests/unit tests/integration`
Expected: PASS. If `tests/unit/nav.test.ts` asserts an exact total item/group count, update it to account for the new group (a rename, not a behavior change).

- [ ] **Step 4: Write the e2e smoke test**

```ts
// tests/e2e/invoicing-smoke.spec.ts
import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test('create a contact, create and send an invoice, and see it reflected on the journal page', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	await page.goto('/invoicing/contacts');
	await page.getByLabel('Nama').fill('PT Pelanggan E2E');
	// ...fill kind + submit the inline create form, following whatever exact field labels Task 4 built...
	await expect(page.getByText('PT Pelanggan E2E')).toBeVisible();

	await page.goto('/invoicing/invoices/new');
	// ...select the contact, an account for each picker, fill one line, submit...
	await expect(page).toHaveURL(/\/invoicing\/invoices\/[0-9a-f-]{36}$/);

	await page.getByRole('button', { name: 'Kirim' }).click();
	await expect(page.getByText(/INV-\d{4}-0001/)).toBeVisible();

	await page.goto('/journal');
	await expect(page.getByText(/INV-\d{4}-0001/)).toBeVisible();
});
```

Exact selectors depend on markup decisions made in Tasks 4-6 (left to those tasks per this plan's own step text) — adjust them to match once that markup exists; the behaviors that matter are "a contact can be created through the UI", "an invoice can be created and sent through the UI", and "a sent invoice's journal is visible on the existing Journal page using its own existing display logic, unmodified."

- [ ] **Step 5: Run the e2e test**

Run: `bun run test:e2e tests/e2e/invoicing-smoke.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite one more time**

Run: `bun test tests/unit tests/integration && bun run test:e2e`
Expected: PASS, no regressions anywhere in the app.

- [ ] **Step 7: Commit**

```bash
git add src/lib/nav.ts src/lib/components/AppSidebar.svelte tests/e2e/invoicing-smoke.spec.ts tests/unit/nav.test.ts
git commit -m "feat(app): add Invoicing navigation and an end-to-end smoke test"
```
