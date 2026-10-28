# Penawaran (Quotation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dokumen penawaran harga dengan revisi `-R<n>`, status Menunggu/Disetujui/Kedaluwarsa, PDF seperti invoice, plus kunci pelanggan saat mengubah invoice dan PO.

**Architecture:** Satu baris `quotations` per versi, dikelompokkan oleh `base_no` per perusahaan dengan kolom `revision` (0 = versi pertama). "Versi terbaru" = revisi tertinggi yang belum dihapus. Status dihitung saat dibaca dari `approved_at` dan `valid_until`. Semua lapisan meniru invoice: layanan di `src/lib/server/invoicing/`, API di `src/routes/api/invoicing/`, halaman di `src/routes/(app)/invoicing/`, `DocumentForm`, `drawDocumentPdf`.

**Tech Stack:** SvelteKit (Svelte 5 runes), Bun, Drizzle ORM + drizzle-kit, Postgres 16, zod 4, pdfkit, bun:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-quotation-design.md`

## Global Constraints

- Semua perintah dijalankan dari `app/`. Tes integrasi: `bun --env-file=../.env test <file>`. Typecheck: `bun run check` (0 error). E2E: `bun run test:e2e <spec>` (lama; jalankan di background).
- Format nomor: `NNN/<KODEPERUSAHAAN>-<KODEKONTAK>/QUO/<BULAN-ROMAWI>/<TAHUN>`; revisi menambah `-R<n>` (`-R1`, `-R2`). Counter key `QUO:v2`. Revisi tidak menaikkan counter.
- Bulan/tahun di nomor dari tanggal versi pertama; mengubah tanggal tidak pernah mengganti nomor.
- Berlaku sampai opsional; bila diisi tidak boleh sebelum tanggal penawaran.
- Status: Disetujui (bila `approved_at`), lalu Kedaluwarsa (bila `valid_until` diisi dan hari ini > `valid_until`), selain itu Menunggu. Versi lama: Direvisi. Hari ini = `todayIso()` dari `src/lib/dates.ts`.
- Hanya versi terbaru yang boleh diubah, direvisi, disetujui, dibatalkan persetujuannya, atau dihapus. Versi Disetujui tidak boleh diubah, direvisi, atau dihapus. Kedaluwarsa boleh langsung disetujui.
- Pelanggan (dan vendor untuk PO) dikunci saat Ubah invoice, PO, penawaran, dan saat Buat Revisi.
- Peran: lihat/unduh `viewer`; tulis `accountant`.
- PDF: judul `PENAWARAN`, subjudul `Quotation`; meta `Nomor Penawaran / Quotation Number`, `Tanggal / Issue Date`, `Berlaku Sampai / Valid Until` (bila diisi); pihak `DITAWARKAN KEPADA / QUOTED TO`; tabel `RINCIAN PENAWARAN / Quotation Details`; tanpa kartu pembayaran; tanda tangan `Approved by,`; file `quotation-<nomor dengan / diganti ->.pdf`.
- Teks UI berbahasa Indonesia, gaya mengikuti halaman invoice. Komentar kode berbahasa Indonesia seperti kode sekitarnya.
- Commit hanya di akhir tiap task, pesan berakhiran `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Dua tab membuat revisi dari versi yang sama bersamaan: satu berhasil, yang lain 409 `quotation_locked`, tidak ada dua versi dengan nomor revisi sama. (Task 3)
- Membuka URL ubah/revisi versi lama (sudah direvisi): server menolak 409 `quotation_locked`; halaman detail versi lama tidak menampilkan tombol tulis. (Task 3, Task 5)
- Kontak dinonaktifkan atau dihapus setelah penawaran dibuat: Ubah dan Buat Revisi tetap jalan karena kontak tidak berubah (tidak memanggil `assertContact` ulang). (Task 3)
- `valid_until` sama dengan hari ini masih Menunggu; sehari setelahnya Kedaluwarsa. (Task 2)
- Menghapus versi pertama saat sudah ada R1 ditolak; menghapus R1 mengembalikan R0 sebagai versi terbaru dan revisi berikutnya menjadi R2, bukan R1. (Task 3)

---

### Task 1: Kunci pelanggan saat mengubah invoice dan PO

**Files:**
- Modify: `src/lib/server/invoicing/invoices.ts` (`updateInvoice`)
- Modify: `src/lib/server/invoicing/purchase-orders.ts` (`updatePurchaseOrder`)
- Modify: `src/lib/components/DocumentForm.svelte` (pemilih kontak nonaktif saat `docId` ada)
- Test: `tests/integration/invoicing-invoice-crud.test.ts`, `tests/integration/invoicing-po-crud.test.ts` (atau file tes PO CRUD yang ada)

**Interfaces:**
- Produces: `contactLocked(): ApiError` di `src/lib/server/invoicing/contacts.ts` → `new ApiError(422, 'contact_locked', 'Pelanggan tidak bisa diganti. Hapus dokumen lalu buat baru bila salah pelanggan', undefined, { field: 'contactId' })`. Dipakai ulang di Task 3.
- Produces: prop `contactLocked?: boolean` di `DocumentForm` (default `!!docId`).

- [ ] **Step 1: Tes gagal** — `test('update rejects a different contact with 422 contact_locked')` untuk invoice dan PO: buat dokumen dengan kontak A, panggil update dengan kontak B, harapkan `ApiError` status 422, code `contact_locked`; kontak di DB tetap A. Tambah `test('update with the same contact still works after the contact is deactivated')`: nonaktifkan/soft-delete kontak, update dengan kontak yang sama → sukses.
- [ ] **Step 2: Jalankan, pastikan gagal.** `bun --env-file=../.env test tests/integration/invoicing-invoice-crud.test.ts`
- [ ] **Step 3: Implementasi.** Di kedua fungsi update, ganti `if (input.contactId !== current.contactId) await assertContact(...)` dengan `if (input.contactId !== current.contactId) throw contactLocked();` dan berhenti meng-update kolom `contactId`. Di `DocumentForm`, teruskan `disabled={contactLocked}` ke `SearchSelect` (cek bahwa prop `disabled` diteruskan ke tombol; bila tidak, tambahkan) dan tampilkan hint `Pelanggan tidak bisa diganti` / `Pemasok tidak bisa diganti` lewat prop `hint` `FormField`.
- [ ] **Step 4: Jalankan tes CRUD invoice dan PO, `bun run check`.** Semua PASS, 0 error. Perbaiki tes lama yang mengganti kontak saat update (ubah harapannya ke 422).
- [ ] **Step 5: Commit** `feat(app): lock the customer/vendor when editing invoices and purchase orders`.

### Task 2: Skema, migrasi, nomor QUO, status, dan skema input

**Files:**
- Modify: `src/lib/server/db/schema.ts` (tabel `quotations`, `quotationLines`)
- Create: `drizzle/migrations/0018_*.sql` via `bunx drizzle-kit generate` (nama bebas dari drizzle-kit)
- Modify: `src/lib/document-number.ts`, `src/lib/server/invoicing/numbering.ts` (kind `'QUO'`)
- Create: `src/lib/quotation-status.ts`
- Create: `src/lib/schemas/quotation.ts`
- Test: `tests/unit/quotation-status.test.ts`, `tests/unit/invoicing-quotation-schema.test.ts`, `tests/unit/document-number.test.ts`

**Interfaces:**
- Produces tabel `quotations`: `id uuid pk`, `company_id` (FK companies, cascade), `contact_id` (FK contacts), `base_no varchar(50) not null`, `revision integer not null default 0`, `subject`, `currency varchar(3) default 'IDR'`, `issue_date day not null`, `valid_until day null`, `subtotal`, `discount default '0'`, `tax_rate`, `tax_amount default '0'`, `total`, `notes text`, `last_signer_id` (FK company_signers, set null), `approved_at timestamptz null`, `approved_by` (FK user, set null), `deleted_at`, `created_by`, `created_at`. Unik `quotations_company_no_rev_uq (company_id, base_no, revision)` (termasuk baris terhapus). `quotation_lines` sama persis dengan `invoice_lines` dengan `quotation_id` (cascade).
- Produces `formatDocumentNumber`/`nextDocumentNumber` menerima `kind: 'INV' | 'PO' | 'RCP' | 'QUO'`.
- Produces `src/lib/quotation-status.ts`:
  - `export type QuotationStatus = 'pending' | 'approved' | 'expired' | 'revised'`
  - `export function quotationStatus(q: { approvedAt: Date | string | null; validUntil: string | null; isLatest: boolean }, today: string): QuotationStatus`
  - `export function quotationNo(baseNo: string, revision: number): string` → `revision === 0 ? baseNo : \`${baseNo}-R${revision}\``
  - `export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string>` = `{ pending: 'Menunggu', approved: 'Disetujui', expired: 'Kedaluwarsa', revised: 'Direvisi' }`
- Produces `src/lib/schemas/quotation.ts`: `CreateQuotationInput` = field invoice (`contactId`, `issueDate`, `discount`, `taxRate`, `subject`, `currency`, `notes: richNotes('Catatan', 8000)`, `lines` memakai `InvoiceLineInput`) + `validUntil: isoDate.optional()`, refine path `['validUntil']` pesan `Berlaku sampai tidak boleh sebelum tanggal penawaran`. `UpdateQuotationInput = ReviseQuotationInput = CreateQuotationInput` (alias seperti invoice).

- [ ] **Step 1: Tes gagal** —
  - `quotationStatus`: `({approvedAt:null, validUntil:'2026-10-29', isLatest:true}, '2026-10-29')` → `'pending'`; hari `'2026-10-30'` → `'expired'`; `validUntil:null` hari apa pun → `'pending'`; `approvedAt` terisi + lewat tanggal → `'approved'`; `isLatest:false` → `'revised'` walau disetujui.
  - `quotationNo('001/A-B/QUO/X/2026', 0)` → `'001/A-B/QUO/X/2026'`; `, 2)` → `'001/A-B/QUO/X/2026-R2'`.
  - `formatDocumentNumber({ seq: 1, companyCode: 'SAB', contactCode: 'PLG', kind: 'QUO', issueDate: '2026-10-29' })` → `'001/SAB-PLG/QUO/X/2026'`.
  - Skema: `validUntil` kosong lolos; `validUntil < issueDate` gagal dengan pesan di atas pada path `validUntil`.
- [ ] **Step 2: Jalankan unit test, pastikan gagal.** `bun test tests/unit/quotation-status.test.ts tests/unit/invoicing-quotation-schema.test.ts tests/unit/document-number.test.ts`
- [ ] **Step 3: Implementasi** file di atas; tambah tabel ke `schema.ts` (pola `invoices`), lalu `bunx drizzle-kit generate` dan `bun run db:migrate`.
- [ ] **Step 4: Unit test PASS, `bun run check` 0 error.**
- [ ] **Step 5: Commit** `feat(app): quotation tables, QUO numbering, status and input schema`.

### Task 3: Layanan penawaran (CRUD, revisi, persetujuan)

**Files:**
- Create: `src/lib/server/invoicing/quotations.ts`
- Test: `tests/integration/invoicing-quotations.test.ts`

**Interfaces:**
- Consumes: Task 2 (`quotations`, `quotationLines`, `quotationStatus`, `quotationNo`, skema input, `nextDocumentNumber` kind `'QUO'`), Task 1 (`contactLocked`). Hitung total dengan logika yang sama dengan `computeTotals` di `invoices.ts` (ekstrak ke fungsi bersama bila perlu; jangan disalin).
- Produces:
  - `interface QuotationListRow { id; quotationNo: string; issueDate: string; validUntil: string | null; total: string; currency: string; contactId: string; contactName: string; status: QuotationStatus; lastSignerId: string | null }` — hanya versi terbaru tiap `base_no`.
  - `interface QuotationDetail` = bentuk `InvoiceDetail` dengan `quotationNo`, `baseNo`, `revision`, `validUntil` (tanpa `dueDate`/`invoiceNo`), plus `approvedAt: Date | null`, `isLatest: boolean`, `status: QuotationStatus`, `history: Array<{ id: string; quotationNo: string; issueDate: string; total: string; status: QuotationStatus }>` (semua versi non-terhapus nomor yang sama, revisi menurun, termasuk dirinya).
  - `createQuotation(companyId, userId, input: CreateQuotationInput): Promise<{ id: string }>`
  - `updateQuotation(companyId, quotationId, input: UpdateQuotationInput): Promise<void>`
  - `reviseQuotation(companyId, userId, quotationId, input: ReviseQuotationInput): Promise<{ id: string }>`
  - `approveQuotation(companyId, userId, quotationId): Promise<void>` / `unapproveQuotation(companyId, quotationId): Promise<void>`
  - `deleteQuotation(companyId, quotationId): Promise<void>`
  - `listQuotations(companyId): Promise<QuotationListRow[]>` / `getQuotation(companyId, quotationId): Promise<QuotationDetail>`
  - Error: `409 'quotation_locked'` `Penawaran ini sudah direvisi. Hanya versi terbaru yang bisa diubah`; `409 'quotation_approved'` `Batalkan persetujuan terlebih dahulu`; `notFound('Penawaran')`.

Aturan yang harus ditegakkan di dalam transaksi, dengan baris target `FOR UPDATE`:
- Tulis apa pun hanya ke versi terbaru (tidak ada versi non-terhapus dengan `revision` lebih besar untuk `base_no` yang sama); bila bukan → `quotation_locked`.
- `update`, `revise`, `delete` ditolak `quotation_approved` bila `approved_at` terisi. `approve` idempoten pada versi terbaru (boleh dari Kedaluwarsa); `unapprove` mengosongkan `approved_at`/`approved_by`.
- `update` dan `revise` menolak kontak berbeda dengan `contactLocked()` dan tidak memanggil `assertContact` bila kontak sama.
- `revise` menyisipkan baris baru: `base_no` sama, `revision = max(revision termasuk yang terhapus) + 1`, `approved_at` null, `last_signer_id` disalin dari versi sumber. Pelanggaran unik → `quotation_locked`.
- `create` memakai `requireCompanyCode`/`requireContactCode`/`assertContact(..., 'CUSTOMER')` seperti invoice.
- `delete` soft delete versi terbaru saja.

- [ ] **Step 1: Tes gagal** (`tests/integration/invoicing-quotations.test.ts`, pola `invoicing-invoice-crud.test.ts`):
  - `create numbers as 001/UJI-PLG/QUO/X/2026 and status pending`
  - `revise creates -R1 with copied signer, old version becomes revised and read-only` (update/approve/delete/revise pada versi lama → 409 `quotation_locked`)
  - `concurrent revise of the same version: exactly one succeeds` (`Promise.allSettled` dua `reviseQuotation`; satu fulfilled, satu rejected `quotation_locked`)
  - `deleting R1 restores R0 as latest and the next revision is R2`
  - `deleting R0 while R1 exists is rejected with quotation_locked`
  - `expired quotation can be approved directly; approved blocks update/revise/delete; unapprove re-enables them` (pakai `validUntil` di masa lalu)
  - `update and revise reject a different contact with contact_locked; same contact works after the contact is soft-deleted`
  - `list shows only the latest version per number with its status`
  - `getQuotation history lists versions newest first`
- [ ] **Step 2: Jalankan, pastikan gagal.** `bun --env-file=../.env test tests/integration/invoicing-quotations.test.ts`
- [ ] **Step 3: Implementasi** `quotations.ts`.
- [ ] **Step 4: Tes PASS; `bun run check` 0 error.**
- [ ] **Step 5: Commit** `feat(app): quotation service with revisions and approval`.

### Task 4: API dan PDF penawaran

**Files:**
- Create: `src/routes/api/invoicing/quotations/+server.ts` (GET viewer → `listQuotations`; POST accountant → `createQuotation`, balas `{ id }`)
- Create: `src/routes/api/invoicing/quotations/[id]/+server.ts` (GET viewer, PUT accountant → `updateQuotation`, DELETE accountant)
- Create: `src/routes/api/invoicing/quotations/[id]/revisions/+server.ts` (POST accountant → `reviseQuotation`, balas `{ id }`)
- Create: `src/routes/api/invoicing/quotations/[id]/approval/+server.ts` (POST accountant → approve; DELETE accountant → unapprove)
- Create: `src/routes/api/invoicing/quotations/[id]/pdf/+server.ts` (pola `invoices/[id]/pdf/+server.ts`)
- Modify: `src/lib/server/invoicing/invoice-pdf.ts` (tambah `drawQuotationPdf`)
- Modify: `src/lib/server/company/signers.ts` (`SignedDocTable` + `typeof quotations`)
- Test: `tests/integration/invoicing-quotation-pdf.test.ts`, `tests/integration/invoicing-quotations-api.test.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces: `drawQuotationPdf(doc: PDFKit.PDFDocument, d: { company: InvoiceCompanyData; contact: ContactRow; quotation: QuotationDetail }): void` — memanggil `drawDocumentPdf` dengan nilai di Global Constraints, `discount` dari penawaran, `paymentCard: false`, `paragraph: null`, `stamp: false`. `parseId(..., 'Penawaran')` di semua rute.

- [ ] **Step 1: Tes gagal** —
  - PDF: `prints PENAWARAN / Quotation, number with -R1, Valid Until, QUOTED TO, Quotation Details, notes, and no payment information` (perusahaan dengan rekening bank diisi; teks tidak berisi `INFORMASI PEMBAYARAN`); `omits Valid Until when empty`; header `content-disposition` = `attachment; filename="quotation-001-UJI-PLG-QUO-X-2026-R1.pdf"`; `?signer=<id>` tersimpan sebagai `lastSignerId`.
  - API: viewer GET list/detail/pdf 200; viewer POST/PUT/DELETE/revisions/approval 403; accountant alur create → revisions → approval POST → PUT ditolak 409 → approval DELETE → PUT 200.
- [ ] **Step 2: Jalankan, pastikan gagal.**
- [ ] **Step 3: Implementasi** rute dan `drawQuotationPdf`.
- [ ] **Step 4: Tes PASS; tes PDF invoice/PO/receipt yang ada tetap PASS; `bun run check` 0 error.**
- [ ] **Step 5: Commit** `feat(app): quotation API and PDF`.

### Task 5: Halaman, form, menu, dan E2E

**Files:**
- Modify: `src/lib/components/DocumentForm.svelte` — `kind: 'invoice' | 'po' | 'quotation'`; prop baru `reviseOf?: string`
- Create: `src/lib/components/QuotationStatusBadge.svelte` (`status: QuotationStatus`; varian Badge: pending `warning`, approved `success`, expired `muted`, revised `muted`; label dari `QUOTATION_STATUS_LABEL`)
- Create: `src/routes/(app)/invoicing/quotations/+page.{server.ts,svelte}`, `new/`, `[id]/`, `[id]/edit/`, `[id]/revise/` (masing-masing `+page.server.ts` dan `+page.svelte`, pola halaman invoice)
- Modify: `src/lib/nav.ts` (item `{ label: 'Penawaran', href: '/invoicing/quotations', min: 'viewer', icon: 'quotation' }` sebelum Invoice), `src/lib/components/AppSidebar.svelte` (ikon `quotation`, mis. `FileSignature`/`ClipboardList` lucide)
- Test: `tests/unit/nav.test.ts` (bila menghitung item), `tests/e2e/invoicing-quotation.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`QuotationStatus`, label), Task 3 (`QuotationListRow`, `QuotationDetail`), Task 4 (URL API).
- `DocumentForm` untuk `quotation`: COPY pelanggan seperti invoice, `date: 'Tanggal penawaran'`, `base: '/api/invoicing/quotations'`, `page: '/invoicing/quotations'`; field `Berlaku sampai (opsional)` (`DateField`, key `validUntil`) di posisi Jatuh tempo; diskon tampil. Simpan: `reviseOf` → `POST ${base}/${reviseOf}/revisions` lalu ke halaman id baru; `docId` → PUT; selain itu POST. Kontak terkunci bila `docId` atau `reviseOf`.

Halaman:
- **Daftar**: kolom Nomor (dengan `-R<n>`), Pelanggan, Tanggal, Berlaku sampai, Total, Status (badge); filter status mengikuti pola filter daftar yang ada; tombol Unduh PDF (`SignerPdfButton`), Hapus (dengan `DeleteDocumentDialog`), Penawaran Baru (accountant).
- **Detail**: header nomor + badge status; data seperti detail invoice ditambah Berlaku sampai; catatan via `notesHtml`. Tombol (accountant, hanya bila `isLatest`): bila tidak disetujui → Ubah, Buat Revisi, Tandai Disetujui, Hapus; bila disetujui → Batalkan persetujuan. Unduh PDF untuk semua versi. Bagian **Riwayat revisi** (bila `history.length > 1`): daftar nomor, tanggal, total, badge, tautan ke versi itu; versi yang sedang dibuka ditandai.
- **Ubah** / **Revisi**: `DocumentForm kind="quotation"` dengan `initial` dari versi itu; revisi memakai `reviseOf={id}` dan judul `Revisi Penawaran`. Loader halaman ubah/revisi mengarahkan (redirect 303) ke detail bila versi bukan terbaru atau sudah disetujui.

- [ ] **Step 1: Tulis E2E gagal** `tests/e2e/invoicing-quotation.spec.ts` (pola `invoicing-smoke.spec.ts`: login, kode perusahaan, kontak): buat penawaran → nomor `^001/E2E-PLG/QUO/[IVX]+/\d{4}$`, badge `Menunggu` → Buat Revisi, ganti harga, simpan → nomor `-R1`, Riwayat revisi berisi versi lama berlabel `Direvisi`; buka versi lama → tidak ada tombol Ubah → kembali ke R1, Tandai Disetujui → badge `Disetujui`, tombol Ubah hilang → Batalkan persetujuan → Ubah muncul lagi → di form Ubah pemilih pelanggan nonaktif → daftar penawaran hanya satu baris (R1). Tambah ke `invoicing-smoke.spec.ts`: di form Ubah invoice, pemilih Pelanggan nonaktif.
- [ ] **Step 2: Jalankan, pastikan gagal.** `bun run test:e2e tests/e2e/invoicing-quotation.spec.ts`
- [ ] **Step 3: Implementasi** komponen, halaman, menu.
- [ ] **Step 4: E2E penawaran dan `invoicing-smoke.spec.ts` PASS; `bun test tests/unit` PASS (kecuali kegagalan lama `buildBreadcrumb > group without label` bila masih ada); `bun run check` 0 error.**
- [ ] **Step 5: Commit** `feat(app): quotation pages, revision history and menu`.
