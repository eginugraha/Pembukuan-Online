# Invoice & PO sebagai Dokumen CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hapus fitur Uang Muka, lalu ubah Invoice dan Purchase Order menjadi dokumen biasa dengan CRUD penuh (soft delete) dan unduh PDF, tanpa status dan tanpa posting jurnal.

**Architecture:** Tiga migrasi Drizzle bertahap (satu per tugas: uang muka, invoice, PO), tiap tugas membawa kode, UI, dan tes sendiri sehingga `check` dan tes hijau di akhir tiap tugas. Layanan server menyisakan `create/get/list/update/delete`; satu komponen form bersama dipakai buat/ubah untuk invoice dan PO.

**Tech Stack:** SvelteKit + Svelte 5, Bun (`bun test`), Drizzle ORM + Postgres, zod 4, pdfkit. Semua di `app/`.

**Spec:** `docs/superpowers/specs/2026-10-24-invoice-po-crud-design.md`

## Global Constraints

- Perintah dijalankan dari `app/`: `bun run check`, `bun test tests/unit tests/integration`, `bun run db:generate`, `bun run db:migrate`.
- Teks UI dan pesan error Bahasa Indonesia; kode, nama berkas, dan komentar mengikuti gaya yang ada (komentar Indonesia, tab indentasi).
- Nomor dokumen `INV-YYYY-NNNN` / `PO-YYYY-NNNN` lewat `nextDocumentNumber(tx, companyId, prefix, year)`, dibuat saat dokumen dibuat, tahun dari `issueDate`, tidak dipakai ulang.
- Hapus = soft delete (`deleted_at`); dokumen terhapus → 404 di get, PDF, `PUT`, `DELETE`.
- Buat/ubah/hapus: `requireRole(event, 'accountant')`; lihat dan PDF: `'viewer'`.
- Subtotal, PPN, total dihitung di server dengan `D`, `sumMoney`, `toMoney` (`src/lib/money`), seperti kode sekarang.
- Tidak boleh ada jalur kode yang menulis `journal_entries` / `journal_lines` dari invoice atau PO.
- Validasi kontak (`assertContact`) hanya saat `contactId` berubah pada ubah; kontak sama selalu diterima.
- Commit tiap tugas; akhiri pesan commit dengan `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Ubah dokumen mengganti seluruh baris tanpa baris yatim dan tanpa mengubah nomor dokumen (diuji di Task 2 dan 3).
- `PUT`/`DELETE`/PDF/get pada dokumen yang sudah dihapus, atau milik perusahaan lain, mengembalikan 404; hapus dua kali juga 404 (Task 2, 3).
- Dokumen yang kontaknya kemudian dihapus tetap bisa dibuka, diubah (kontak sama), dan dicetak PDF; mengganti ke kontak terhapus ditolak (Task 2, 3).
- Tarif PPN kosong, `0`, dan `100` menghasilkan PPN `0.00` / `0.00` / sama dengan subtotal (Task 2, 3).
- Migrasi berjalan bersih pada database yang berisi invoice terposting, terbayar via uang muka, dan dibatalkan; jurnal impor biasa tidak ikut terhapus dan neraca saldo tetap bisa dibuka (Task 1, 2, 3 — langkah verifikasi migrasi).

---

### Task 1: Hapus fitur Uang Muka

**Files:**
- Delete: `src/lib/server/invoicing/advance-receipts.ts`, `src/lib/schemas/advance-receipt.ts`, `src/routes/(app)/invoicing/advance-receipts/` (seluruh folder), `src/routes/api/invoicing/advance-receipts/` (seluruh folder), `tests/unit/invoicing-advance-receipt-schema.test.ts`, `tests/integration/invoicing-advance-receipts.test.ts`, `tests/integration/invoicing-invoice-pay-advance.test.ts`
- Modify: `src/lib/nav.ts` (item "Uang Muka"), `src/lib/components/AppSidebar.svelte` (ikon `advance`, impor `HandCoins`), `src/lib/server/db/schema.ts`, `src/lib/server/invoicing/invoices.ts` (hapus `payInvoiceByAdvanceReceipt` dan cabang uang muka di `cancelInvoice`), `src/lib/schemas/invoice.ts` (`PayInvoiceInput` hanya `BANK`), `src/routes/api/invoicing/invoices/[id]/pay/+server.ts`, `src/routes/(app)/invoicing/invoices/[id]/+page.svelte` (tombol/dialog "Terapkan Uang Muka"), `src/lib/server/invoicing/posting.ts` (`advanceReceiptId`), `src/lib/server/invoicing/numbering.ts` (prefix `'INV' | 'PO'`), `tests/integration/rbac-matrix.test.ts`, `tests/integration/invoicing-final-review.test.ts`, `tests/integration/invoicing-posting.test.ts`, `tests/integration/invoicing-schema.test.ts`, `tests/integration/invoicing-numbering.test.ts`, `tests/integration/invoicing-invoice-pay-cancel.test.ts` (cabang uang muka)
- Create: migrasi baru lewat `bun run db:generate`

**Interfaces:**
- Produces: `PayInvoiceInput = { date: string; method: 'BANK' }`; `nextDocumentNumber(tx, companyId, prefix: 'INV' | 'PO', year)`; `journal_entries` tanpa kolom `advance_receipt_id`.

- [ ] **Step 1:** Jalankan `bun run check` dan `bun test tests/unit tests/integration`; catat hasil dasar (hanya tes neraca saldo yang boleh flaky karena batas waktu).
- [ ] **Step 2:** Hapus berkas/folder daftar Delete, item nav dan ikon, lalu bersihkan semua impor dan cabang uang muka di berkas Modify. `PayInvoiceInput` menjadi satu objek `{ date: isoDate, method: z.literal('BANK') }`; `payInvoiceByBank` menjadi satu-satunya jalur bayar. `cancelInvoice` tidak lagi membalik/mengembalikan uang muka; kolom `paidViaAdvanceReceiptId` dibuang dari tipe dan kueri.
- [ ] **Step 3:** Di `schema.ts` hapus tabel `advanceReceipts`, enum `advanceReceiptStatus`, kolom `invoices.paidViaAdvanceReceiptId`, `journalEntries.advanceReceiptId`. Jalankan `bun run db:generate`, lalu **edit SQL yang dihasilkan** agar dimulai dengan, berurutan: `DELETE FROM journal_entries WHERE advance_receipt_id IS NOT NULL;`, `UPDATE invoices SET paid_via_advance_receipt_id = NULL;`, `DELETE FROM advance_receipts;`, `DELETE FROM document_number_counters WHERE prefix = 'UM';` — baru pernyataan DROP hasil generate. Entri jurnal pelunasan invoice via uang muka ikut terhapus oleh baris pertama (ia membawa `advance_receipt_id`).
- [ ] **Step 4:** Perbarui tes yang tersisa agar tidak merujuk uang muka (rbac-matrix: buang impor dan baris uang muka; numbering: buang kasus `UM`). Jalankan `bun run db:migrate`.
- [ ] **Step 5:** Verifikasi: `bun run check` → 0 error; `bun test tests/unit tests/integration` → semua lolos; `grep -rniE "advance|uang muka" src tests` → tidak ada sisa selain komentar sejarah di folder `docs/`.
- [ ] **Step 6:** Commit `feat(app): remove the advance receipt (uang muka) feature`.

---

### Task 2: Invoice menjadi dokumen CRUD

**Files:**
- Create: `src/lib/components/DocumentForm.svelte`, `src/lib/components/DeleteDocumentDialog.svelte`, `src/routes/(app)/invoicing/invoices/[id]/edit/+page.svelte`, `src/routes/(app)/invoicing/invoices/[id]/edit/+page.server.ts`, `tests/integration/invoicing-invoice-crud.test.ts`, migrasi baru
- Modify: `src/lib/server/db/schema.ts`, `src/lib/schemas/invoice.ts`, `src/lib/server/invoicing/invoices.ts`, `src/lib/server/invoicing/pdf.ts`, `src/routes/api/invoicing/invoices/+server.ts`, `src/routes/api/invoicing/invoices/[id]/+server.ts`, `src/routes/api/invoicing/invoices/[id]/pdf/+server.ts`, `src/routes/(app)/invoicing/invoices/+page.svelte`, `.../invoices/new/+page.svelte` dan `+page.server.ts`, `.../invoices/[id]/+page.svelte` dan `+page.server.ts`, `tests/unit/invoicing-invoice-schema.test.ts`, `tests/integration/invoicing-invoice-pdf.test.ts`, `tests/integration/rbac-matrix.test.ts`, `tests/integration/invoicing-final-review.test.ts`
- Delete: `src/routes/api/invoicing/invoices/[id]/{send,pay,cancel}/`, `tests/integration/invoicing-invoice-send.test.ts`, `tests/integration/invoicing-invoice-pay-cancel.test.ts`, `tests/integration/invoicing-invoice-create.test.ts` (digantikan oleh tes CRUD)

**Interfaces:**
- Produces (skema, `src/lib/schemas/invoice.ts`): `CreateInvoiceInput = { contactId: string; issueDate: string; taxRate?: string; notes?: string | null; lines: { description: string; quantity: string; unitPrice: string }[] (min 1) }`; `UpdateInvoiceInput = CreateInvoiceInput` (tipe dan skema yang sama). Hilang: semua field akun, `SendInvoiceInput`, `PayInvoiceInput`.
- Produces (layanan, `invoices.ts`): `createInvoice(companyId, userId, input): Promise<{ id: string }>` (membuat nomor `INV` di dalam transaksi); `updateInvoice(companyId, invoiceId, input: UpdateInvoiceInput): Promise<void>` (ganti header dan seluruh baris, nomor tidak berubah, 404 bila tidak ada/terhapus, `assertContact(tx, companyId, contactId, 'CUSTOMER')` hanya bila `contactId` berubah); `deleteInvoice(companyId, invoiceId): Promise<void>`; `listInvoices(companyId): Promise<InvoiceListRow[]>` dan `getInvoice(companyId, id): Promise<InvoiceDetail>` yang menyaring `deletedAt IS NULL`. `InvoiceListRow = { id; invoiceNo: string; issueDate; total; contactId; contactName }`; `InvoiceDetail` = baris `invoices` + `lines: { id; lineNo; description; quantity; unitPrice; amount }[]` tanpa `status` dan tanpa kolom akun.
- Produces (API): `GET/PUT/DELETE /api/invoicing/invoices/[id]` (`PUT` body `UpdateInvoiceInput` → `{ ok: true }`; `DELETE` → `{ ok: true }`); `POST /api/invoicing/invoices` tetap.
- Produces (UI): `DocumentForm.svelte` props `{ kind: 'invoice' | 'po'; contacts: { id: string; name: string }[]; docId?: string; initial?: { contactId; issueDate; expectedDate?; taxRate; notes; lines: { description; quantity; unitPrice }[] } }` — mode ubah bila `docId` ada (`PUT`), selain itu `POST`; setelah sukses `goto(<detail>)`. `DeleteDocumentDialog.svelte` props `{ open: boolean (bindable); name: string; busy: boolean; onconfirm: () => void }`.

- [ ] **Step 1: Tes yang gagal** — `tests/integration/invoicing-invoice-crud.test.ts`, kasus (pakai `makeCompany`, `makeUser`, `createContact`, `resetDb`):
  - `create assigns INV-<tahun issueDate>-0001, computes totals, writes no journal` (`journal_entries` untuk perusahaan itu kosong).
  - `update replaces header and all lines and keeps the number` (3 baris → 1 baris; `getInvoice().lines` panjang 1; `invoiceNo` sama; subtotal/total dihitung ulang).
  - `delete soft-deletes: gone from list/get, second delete and update give 404, number is not reused` (dokumen baru berikutnya `...-0002`).
  - `another company cannot get, update, or delete it` (404).
  - `keeps working after its contact is deleted; switching to a deleted contact is rejected` (kontak sama lolos, kontak lain terhapus → 404).
  - `tax rate empty/0 gives 0.00, 100 gives tax equal to subtotal`.
  - Tambahkan ke `tests/unit/invoicing-invoice-schema.test.ts`: `no account fields are required`, `needs at least one line`, `tax rate over 100 rejected`.
- [ ] **Step 2:** Jalankan `bun test tests/integration/invoicing-invoice-crud.test.ts tests/unit/invoicing-invoice-schema.test.ts` → gagal (fungsi/field belum ada).
- [ ] **Step 3: Skema dan migrasi.** Di `schema.ts`: buang `invoiceStatus`, `invoices.status`, `receivableAccountId`, `taxAccountId`, `invoiceLines.revenueAccountId`; tambah `invoices.deletedAt` (`timestamp('deleted_at', { withTimezone: true })`); `invoiceNo` menjadi `.notNull()`. `bun run db:generate`, lalu edit SQL hasilnya agar dimulai dengan, berurutan: `DELETE FROM journal_entries WHERE invoice_id IS NOT NULL;`, `DELETE FROM invoice_lines;`, `DELETE FROM invoices;`, `DELETE FROM document_number_counters WHERE prefix = 'INV';` — baru DROP/ALTER hasil generate (FK `journal_entries.invoice_id` tetap sampai Task 3).
- [ ] **Step 4: Skema zod dan layanan.** Ubah `src/lib/schemas/invoice.ts` dan `invoices.ts` sesuai blok Interfaces; hapus `sendInvoice`, `payInvoiceByBank`, `cancelInvoice`, `assertInvoiceAccounts`, impor `posting`/`accounts`/`closing`. Hitung total lewat helper yang sudah ada (`computeLines`).
- [ ] **Step 5:** Rute API: tambah `PUT` dan `DELETE` di `invoices/[id]/+server.ts` (pola `contacts/[id]/+server.ts`, `parseId(event.params.id, 'Invoice')`); hapus folder `send`, `pay`, `cancel`. PDF: `drawDocumentPdf` buang `statusLabel` dan barisnya; rute PDF buang `STATUS_LABELS` dan `statusLabel`, nomor file `invoice-${invoice.invoiceNo}.pdf`.
- [ ] **Step 6: Jalankan tes Step 2** → lolos.
- [ ] **Step 7: UI.** Buat `DocumentForm.svelte` dengan memindahkan isi `invoices/new/+page.svelte` (header, baris, ringkasan, validasi per baris) menjadi komponen: buang kolom akun (piutang, PPN, pendapatan per baris), label berdasarkan `kind` ("Pelanggan"/"Pemasok", "Tanggal invoice"/"Tanggal PO"; field tanggal perkiraan tiba hanya `kind === 'po'`), tombol "Simpan". `new/+page.svelte` dan `[id]/edit/+page.svelte` menjadi pembungkus tipis; load `new` memakai `listContacts(..., { kind: 'CUSTOMER', activeOnly: true })`, load `edit` memakai `getInvoice` dan menambahkan kontak dokumen saat ini ke pilihan bila tidak ada di daftar (`getContact`). Daftar `invoices/+page.svelte`: buang kolom/badge status; tambah kolom Aksi — **Lihat** (`/invoicing/invoices/{id}`), **PDF** (`/api/invoicing/invoices/{id}/pdf`), serta **Ubah** (`.../edit`) dan **Hapus** (`DeleteDocumentDialog`, `DELETE`, lalu `invalidateAll()`) hanya bila `roleAtLeast(role, 'accountant')`. Detail `[id]/+page.svelte`: buang semua dialog/tombol Kirim, Bayar, Batalkan, status; sisakan Unduh PDF, Ubah, Hapus (setelah hapus `goto('/invoicing/invoices')`); tampilkan nomor, kontak (Attn, posisi), tanggal, tabel baris tanpa kolom akun, subtotal/PPN/total, catatan.
- [ ] **Step 8:** Perbarui tes yang tersisa: `invoicing-invoice-pdf.test.ts` (buang `sendInvoice`, buat lewat `createInvoice`, teks `INV-2026-0001` tetap), `rbac-matrix.test.ts` (invoice: `GET` viewer, `POST/PUT/DELETE` accountant, `pdf` viewer; hapus baris send/pay/cancel), `invoicing-final-review.test.ts` (pertahankan tes kontak dan isolasi perusahaan yang masih relevan; hapus tes yang membahas posting/status invoice).
- [ ] **Step 9: Verifikasi migrasi.** `bun run db:migrate`; di psql/skrip singkat pastikan `select count(*) from invoices` = 0 dan `journal_entries` bukan-invoice tetap ada. Lalu `bun run check` → 0 error; `bun test tests/unit tests/integration` → lolos.
- [ ] **Step 10:** Commit `feat(app): make Invoice a plain CRUD document with PDF`.

---

### Task 3: Purchase Order menjadi dokumen CRUD dan pembersihan jurnal

**Files:**
- Create: `src/routes/(app)/invoicing/purchase-orders/[id]/edit/+page.svelte`, `.../edit/+page.server.ts`, `tests/integration/invoicing-po-crud.test.ts`, migrasi baru
- Modify: `src/lib/server/db/schema.ts`, `src/lib/schemas/purchase-order.ts`, `src/lib/server/invoicing/purchase-orders.ts`, `src/routes/api/invoicing/purchase-orders/+server.ts`, `.../purchase-orders/[id]/+server.ts`, `.../purchase-orders/[id]/pdf/+server.ts`, `src/routes/(app)/invoicing/purchase-orders/+page.svelte`, `.../new/+page.svelte` dan `+page.server.ts`, `.../[id]/+page.svelte` dan `+page.server.ts`, `tests/unit/invoicing-po-schema.test.ts`, `tests/integration/invoicing-po-pdf.test.ts`, `tests/integration/rbac-matrix.test.ts`, `tests/integration/invoicing-final-review.test.ts`, `tests/integration/invoicing-schema.test.ts`
- Delete: `src/routes/api/invoicing/purchase-orders/[id]/{issue,receive,cancel}/`, `src/lib/server/invoicing/posting.ts`, `src/lib/server/invoicing/accounts.ts`, `tests/integration/invoicing-posting.test.ts`, `tests/integration/invoicing-accounts.test.ts`, `tests/integration/invoicing-po-create-issue.test.ts`, `tests/integration/invoicing-po-receive-cancel.test.ts`

**Interfaces:**
- Consumes: `DocumentForm.svelte` (`kind: 'po'`) dan `DeleteDocumentDialog.svelte` dari Task 2.
- Produces (skema): `CreatePurchaseOrderInput = { contactId; issueDate; expectedDate?: string; taxRate?: string; notes?: string | null; lines: { description; quantity; unitPrice }[] }`; `UpdatePurchaseOrderInput = CreatePurchaseOrderInput`.
- Produces (layanan): `createPurchaseOrder(companyId, userId, input): Promise<{ id: string }>` (nomor `PO`), `updatePurchaseOrder(companyId, poId, input): Promise<void>`, `deletePurchaseOrder(companyId, poId): Promise<void>`, `listPurchaseOrders`, `getPurchaseOrder` dengan bentuk dan aturan yang sama seperti invoice (`POListRow`, `PODetail` tanpa `status` dan tanpa kolom akun; kontak divalidasi sebagai `'VENDOR'`).
- Produces (DB): tabel `journal_entries` tanpa `invoice_id`, `purchase_order_id`.

- [ ] **Step 1: Tes yang gagal** — `tests/integration/invoicing-po-crud.test.ts` dengan kasus yang sama seperti Task 2 untuk PO (nomor `PO-<tahun>-0001`, update mengganti baris dan menjaga nomor dan `expectedDate`, soft delete + 404 + nomor tidak dipakai ulang, isolasi perusahaan, kontak terhapus, PPN 0/100, tidak ada jurnal ditulis, kontak `CUSTOMER` saja ditolak sebagai pemasok). Tambahkan `no account fields are required` ke `tests/unit/invoicing-po-schema.test.ts`. Jalankan → gagal.
- [ ] **Step 2: Skema dan migrasi.** Di `schema.ts`: buang `poStatus`, `purchaseOrders.status`, `payableAccountId`, `taxAccountId`, `purchaseOrderLines.expenseAccountId`, `journalEntries.invoiceId`, `journalEntries.purchaseOrderId`; tambah `purchaseOrders.deletedAt`; `poNo` `.notNull()`. `bun run db:generate`, edit SQL agar dimulai dengan: `DELETE FROM journal_entries WHERE purchase_order_id IS NOT NULL OR invoice_id IS NOT NULL;`, `DELETE FROM purchase_order_lines;`, `DELETE FROM purchase_orders;`, `DELETE FROM document_number_counters WHERE prefix = 'PO';` — lalu DROP/ALTER hasil generate. (`journal_lines` ikut terhapus lewat cascade FK `journal_id`; pastikan di langkah verifikasi.)
- [ ] **Step 3:** Ubah `src/lib/schemas/purchase-order.ts` dan `purchase-orders.ts` sesuai Interfaces (hapus `issue/receive/cancel`, `ReceivePurchaseOrderInput`, impor `posting`/`accounts`/`closing`). Hapus `posting.ts` dan `accounts.ts`; `grep -rn "invoicing/posting\|invoicing/accounts" src tests` harus kosong.
- [ ] **Step 4:** Rute API PO seperti Task 2 (`PUT`, `DELETE`; hapus `issue`, `receive`, `cancel`); PDF PO tanpa `statusLabel`, nama file `po-${poNo}.pdf`.
- [ ] **Step 5: Jalankan tes Step 1** → lolos.
- [ ] **Step 6: UI** mengikuti Step 7 Task 2 untuk `/invoicing/purchase-orders`: daftar (kolom Aksi Lihat/PDF/Ubah/Hapus, tanpa status), `new` dan `[id]/edit` memakai `DocumentForm kind="po"` (kontak `VENDOR`), detail tanpa Terbitkan/Terima/Batalkan, menampilkan `expectedDate` bila ada.
- [ ] **Step 7:** Perbarui `rbac-matrix.test.ts` (PO: `GET`/`pdf` viewer, `POST/PUT/DELETE` accountant), `invoicing-final-review.test.ts`, `invoicing-schema.test.ts`, `invoicing-po-pdf.test.ts` (buat lewat `createPurchaseOrder`).
- [ ] **Step 8: Verifikasi migrasi dan pembersihan.** `bun run db:migrate`; pastikan `select count(*) from journal_entries where description like 'Invoice %' or description like 'PO %'` = 0, jurnal dari impor transaksi biasa masih ada, dan `/trial-balance`, `/journal`, `/ledger` terbuka tanpa error (lewat tes yang sudah ada atau `bun run dev` + buka halaman). `bun run check` → 0 error; `bun test tests/unit tests/integration` → lolos.
- [ ] **Step 9:** Commit `feat(app): make Purchase Order a plain CRUD document and drop invoicing journal posting`.

---

### Task 4: Smoke test, bersih-bersih, dan verifikasi akhir

**Files:**
- Modify: `tests/e2e/invoicing-smoke.spec.ts`, `src/routes/(app)/invoicing/contacts/+page.svelte` (deskripsi bila perlu), `docs/superpowers/specs/2026-10-24-invoice-po-crud-design.md` (tidak diubah kecuali ada penyimpangan)

- [ ] **Step 1:** Tulis ulang `invoicing-smoke.spec.ts` (Playwright, pola login yang ada): buat kontak lewat dialog "Tambah kontak" → buat invoice di `/invoicing/invoices/new` (tanpa akun) → terarah ke halaman detail dan nomor `INV-` terlihat → ubah keterangan baris lewat Ubah → kembali ke daftar, hapus lewat kolom Aksi dan konfirmasi → baris hilang; kemudian `/journal` tidak memuat entri invoice. Jalankan `bun run test:e2e`; bila lingkungan Playwright tidak tersedia, laporkan itu apa adanya.
- [ ] **Step 2:** Cari sisa: `grep -rniE "uang muka|advance|Kirim|Terkirim|Lunas|Diterbitkan|Diterima|Dibatalkan|postJournal|receivableAccount|payableAccount|revenueAccount|expenseAccount" src tests` — hasilnya hanya boleh berupa kata umum yang tidak terkait invoicing; perbaiki sisanya.
- [ ] **Step 3:** `bun run check` → 0 error; `bun test tests/unit tests/integration` → semua lolos (satu kegagalan karena batas waktu pada tes neraca saldo diulang sendiri dan harus lolos).
- [ ] **Step 4:** Jalankan `bun run dev` dan telusuri manual: Kontak, Invoice (buat, ubah, hapus, PDF, tampilan Attn), Purchase Order (sama), sidebar tanpa "Uang Muka", Jurnal Umum, Buku Besar. Laporkan temuan.
- [ ] **Step 5:** Commit `test(app): update smoke test and clean up leftovers for document CRUD`.
