# Payment Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dari halaman detail invoice, pengguna menerbitkan satu Payment Receipt (kuitansi) berstempel LUNAS: salinan tetap dari invoice, bernomor `NNN/KODE-KODE/RCP/BULAN/TAHUN`, dengan PDF memakai tata letak invoice.

**Architecture:** Dua tabel baru (`payment_receipts`, `payment_receipt_lines`) menyimpan salinan invoice saat diterbitkan. Service `payment-receipts.ts` menerbitkan, membaca, dan menghapus (soft) receipt, dengan satu receipt aktif per invoice dijaga indeks unik parsial. Renderer PDF invoice diparameterkan supaya `drawReceiptPdf` memakai ulang tata letaknya. API, UI, dan e2e menyusul di tugas terakhir.

**Tech Stack:** SvelteKit 2 + Svelte 5, Drizzle (Postgres) + drizzle-kit, zod 4, pdfkit 0.20.2, `bun test` (unit + integrasi, `pdf-parse`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-payment-receipt-design.md`. Referensi tampilan: `docs/superpowers/specs/assets/2026-10-26-advance-receipt-lunas-stamp-mockup.html` (stempel), `docs/superpowers/specs/assets/2026-10-26-invoice-mockup.html` dan `app/src/lib/server/invoicing/invoice-pdf.ts` (tata letak).

Semua perintah dijalankan dari folder `app/`.

## Global Constraints

- Nomor: `NNN/<KODEPERUSAHAAN>-<KODEKONTAK>/RCP/<BULAN-ROMAWI>/<TAHUN>`, misalnya `001/SET-XFORMATION/RCP/IV/2026`. Bulan dan tahun dari **tanggal pembayaran**. Urutan per perusahaan, per tahun, mulai 001, terpisah dari INV dan PO. Kunci counter `RCP:v2` di `document_number_counters`.
- Kode perusahaan dan kode kontak wajib saat menerbitkan (422 `missing_company_code` / `missing_contact_code`), diperiksa sebelum counter bertambah, di transaksi yang sama. Kode kontak diambil dari kontak saat penerbitan. Nomor yang sudah terbit tidak berubah.
- Nomor receipt unik per perusahaan **termasuk yang sudah dihapus**. Hapus receipt = soft delete; setelah itu invoice yang sama boleh menerbitkan receipt baru dengan nomor baru.
- Satu invoice, satu receipt **aktif**. Invoice yang sudah dihapus tidak bisa menerbitkan receipt. Invoice yang masih punya receipt aktif tidak bisa dihapus: 409 `invoice_has_receipt`, pesan "Hapus receipt terlebih dahulu".
- Receipt adalah salinan tetap: data pelanggan (nama, attention, posisi, alamat, email, telepon, NPWP), nomor invoice asal, perihal, baris, nominal (subtotal, diskon, tarif dan jumlah PPN, total), mata uang, dan catatan. Data perusahaan (nama, alamat, logo, email, telepon, penanda tangan, tanda tangan, watermark) dibaca langsung saat PDF dibuat. Mengubah invoice atau kontak sesudahnya tidak mengubah receipt.
- Tidak masuk jurnal umum atau buku besar, dan invoice tidak mendapat status.
- Tanggal pembayaran wajib (`isoDate`), tanpa validasi terhadap tanggal invoice.
- Hak akses: menerbitkan dan menghapus = peran `accountant` (sama dengan buat/hapus invoice); melihat dan mengunduh PDF = `viewer`.
- PDF receipt: judul "PAYMENT RECEIPT", subjudul miring "Kuitansi Pembayaran". Blok kanan atas: "Nomor Kuitansi / Receipt Number", "Tanggal Pembayaran / Payment Date", "Nomor Invoice / Invoice Number" (tanpa Jatuh Tempo). Tanpa kartu "INFORMASI PEMBAYARAN". Setelah terbilang ada paragraf (hanya Bahasa Indonesia): `Dokumen ini merupakan bukti pembayaran atas pembelian {perihal}. Kuitansi ini diterbitkan sebagai bukti penerimaan pembayaran atas transaksi tersebut.` Bila perihal kosong: `pembelian pada Invoice {nomor invoice}`. Tanda tangan "Acknowledged by,". Stempel "LUNAS" hijau transparan di tengah halaman, miring ≈ −20°, di atas konten, di setiap halaman, tanpa pilihan mematikan. Selebihnya persis tata letak invoice (margin `INVOICE_MARGIN`, label dwibahasa, mata uang, terbilang, catatan, watermark).
- PDF invoice yang ada **tidak boleh berubah** (tes `invoicing-invoice-pdf.test.ts` yang ada tetap lulus tanpa diubah).
- Teks UI Bahasa Indonesia. Pola yang ada: `apiHandler` / `parseJson` / `ApiError(status, code, message, undefined, { field })`, `requireRole`, `FormState`, `DeleteDocumentDialog`, `DateField`.

## Review Focus

- Tombol terbitkan ditekan dua kali atau dua pengguna bersamaan: tepat satu receipt aktif dan satu nomor terpakai (Task 2).
- Invoice dan kontaknya diubah setelah receipt terbit: detail dan PDF receipt tetap sama (Task 2, Task 3).
- Perusahaan atau kontak tanpa kode: 422, tidak ada baris receipt, dan counter tidak bertambah (Task 2).
- Hapus receipt lalu terbitkan ulang mendapat nomor baru (nomor lama tidak dipakai lagi), dan invoice yang sudah dihapus tidak bisa menerbitkan receipt (Task 2).
- Receipt panjang (banyak baris, beberapa halaman): stempel ada di setiap halaman, "Acknowledged by," tepat satu kali di halaman terakhir, paragraf bukti pembayaran ada, dan tidak ada kartu pembayaran (Task 3).

---

### Task 1: Jenis dokumen `RCP` pada penomoran

**Files:**
- Modify: `app/src/lib/document-number.ts`, `app/src/lib/server/invoicing/numbering.ts`
- Test: `app/tests/unit/document-number.test.ts`, `app/tests/integration/invoicing-numbering.test.ts`

**Interfaces:**
- Produces: `formatDocumentNumber(o: { seq; companyCode; contactCode; kind: 'INV' | 'PO' | 'RCP'; issueDate })` dan `nextDocumentNumber(tx, companyId, o: { kind: 'INV' | 'PO' | 'RCP'; issueDate; companyCode; contactCode })`. Untuk `RCP`, `issueDate` adalah tanggal pembayaran.

- [ ] **Step 1: Write the failing tests.** Unit: `formatDocumentNumber({ seq: 1, companyCode: 'SET', contactCode: 'XFORMATION', kind: 'RCP', issueDate: '2026-04-15' })` menghasilkan `'001/SET-XFORMATION/RCP/IV/2026'`. Integrasi: dua `RCP` berurutan pada 2026 menghasilkan `001/…/RCP/…` lalu `002/…`; `RCP` pertama tetap `001` walau INV sudah di 003 dan PO di 002 pada perusahaan yang sama; tahun 2027 kembali `001`; baris counter memakai `prefix = 'RCP:v2'`.
- [ ] **Step 2: Run** `bun test tests/unit/document-number.test.ts tests/integration/invoicing-numbering.test.ts`. Expected: FAIL (tipe/nilai `RCP` belum ada).
- [ ] **Step 3: Implement** dengan melebarkan tipe `kind` di kedua fungsi. Tidak ada logika baru.
- [ ] **Step 4: Run** the same tests dan `bun run check`. Expected: PASS, 0 error.
- [ ] **Step 5: Commit** `feat(app): RCP document number kind`

---

### Task 2: Tabel, migrasi, dan service payment receipt

**Files:**
- Modify: `app/src/lib/server/db/schema.ts` (tabel baru), `app/src/lib/server/invoicing/invoices.ts` (`deleteInvoice` + `InvoiceListRow.hasReceipt`)
- Create: migrasi hasil `bun run db:generate` di `app/drizzle/migrations/`, `app/src/lib/schemas/payment-receipt.ts`, `app/src/lib/server/invoicing/payment-receipts.ts`
- Test: `app/tests/integration/invoicing-payment-receipt.test.ts`, `app/tests/integration/invoicing-invoice-crud.test.ts` (tes delete dan list)

**Interfaces:**
- Consumes: `requireCompanyCode`, `requireContactCode`, `nextDocumentNumber` (Task 1), `getInvoice`.
- Produces:
  - Tabel `paymentReceipts` (`payment_receipts`): `id`, `companyId` (FK cascade), `invoiceId` (FK), `receiptNo varchar(50)`, `paymentDate day`, `invoiceNo varchar(50)`, `subject text?`, `currency varchar(3)`, `subtotal`, `discount`, `taxRate numeric(5,2)?`, `taxAmount`, `total`, `notes text?`, kolom salinan kontak (`contactName text`, `contactAttention`, `contactPosition`, `contactAddress`, `contactEmail`, `contactPhone`, `contactNpwp`, semua nullable kecuali nama), `deletedAt`, `createdBy`, `createdAt`. Unik `(companyId, receiptNo)` (termasuk yang terhapus) dan indeks unik parsial pada `invoiceId` `WHERE deleted_at IS NULL`. Tabel `paymentReceiptLines` (`payment_receipt_lines`): `id`, `receiptId` (FK cascade), `lineNo`, `description`, `quantity`, `unitPrice`, `amount`.
  - `IssuePaymentReceiptInput = z.object({ paymentDate: isoDate })` di `schemas/payment-receipt.ts`.
  - `interface PaymentReceiptDetail { id; companyId; invoiceId; receiptNo; paymentDate; invoiceNo; subject: string | null; currency: string; subtotal; discount; taxRate: string | null; taxAmount; total; notes: string | null; contact: { name: string; attention: string | null; position: string | null; address: string | null; email: string | null; phone: string | null; npwp: string | null }; lines: { id; lineNo; description; quantity; unitPrice; amount }[]; createdAt: Date }` (semua nominal `string`).
  - `issuePaymentReceipt(companyId: string, userId: string, invoiceId: string, input: IssuePaymentReceiptInput): Promise<{ id: string }>`; `getPaymentReceiptForInvoice(companyId: string, invoiceId: string): Promise<PaymentReceiptDetail | null>` (hanya yang aktif); `deletePaymentReceipt(companyId: string, invoiceId: string): Promise<void>` (404 bila tidak ada yang aktif).
  - `InvoiceListRow.hasReceipt: boolean`.
- Error: invoice tidak ada atau sudah dihapus → 404 (`notFound('Invoice')`). Receipt aktif sudah ada → `ApiError(409, 'receipt_exists', 'Invoice ini sudah punya receipt')`. `deleteInvoice` saat ada receipt aktif → `ApiError(409, 'invoice_has_receipt', 'Hapus receipt terlebih dahulu')`.

- [ ] **Step 1: Write the failing tests** (bun:test, pola `invoicing-invoice-crud.test.ts`; `makeCompany` berkode `UJI`, `makeContact` berkode `PLG`):
  - Terbit: nomor `001/UJI-PLG/RCP/<romawi bulan paymentDate>/<tahun paymentDate>`. Tanggal pembayaran 2026-04-15 untuk invoice bertanggal 2026-10-01 menghasilkan `…/RCP/IV/2026`. `getPaymentReceiptForInvoice` mengembalikan salinan lengkap (nomor invoice, perihal, mata uang USD, diskon, PPN, baris, data kontak).
  - Snapshot: setelah terbit, `updateInvoice` mengubah baris, perihal, dan mata uang, dan nama serta alamat kontak diubah. `getPaymentReceiptForInvoice` tetap mengembalikan nilai lama.
  - Dua `issuePaymentReceipt` bersamaan (`Promise.allSettled`) pada invoice yang sama: tepat satu berhasil, yang lain 409 `receipt_exists`, dan terbit berikutnya setelah hapus bernomor `002` (bukan `003`), karena transaksi yang gagal membatalkan counter.
  - Perusahaan tanpa kode → 422 `missing_company_code`. Kontak tanpa kode → 422 `missing_contact_code`. Keduanya tanpa baris receipt dan nomor berikutnya yang sukses tetap `001`.
  - Hapus lalu terbit ulang: setelah `deletePaymentReceipt`, `getPaymentReceiptForInvoice` mengembalikan `null`. Terbit ulang menghasilkan `002/…`, nomor `001` tidak muncul lagi. `deletePaymentReceipt` kedua kali menghasilkan 404.
  - Invoice yang sudah dihapus: `issuePaymentReceipt` 404. `deleteInvoice` saat ada receipt aktif 409 `invoice_has_receipt`, dan berhasil setelah receipt dihapus.
  - Perusahaan lain: tidak bisa menerbitkan atau membaca (404 atau `null`).
  - Tidak ada jurnal: jumlah `journalEntries` tidak berubah.
  - `listInvoices(companyId)`: `hasReceipt` `true` untuk invoice yang punya receipt aktif dan `false` setelah receipt dihapus atau bila belum ada.
- [ ] **Step 2: Run** `bun test tests/integration/invoicing-payment-receipt.test.ts tests/integration/invoicing-invoice-crud.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** skema, `bun run db:generate` (periksa SQL: hanya `CREATE TABLE`, indeks, FK; tanpa DROP), lalu service. Penerbitan berjalan dalam satu `db.transaction`: baca invoice dan barisnya (tidak terhapus), `requireCompanyCode`, ambil baris kontak invoice **tanpa** menyaring `deletedAt`/`isActive`, `requireContactCode`, `nextDocumentNumber({ kind: 'RCP', issueDate: paymentDate, … })`, lalu sisipkan receipt dan barisnya. Pelanggaran indeks unik parsial pada `invoiceId` (kode Postgres `23505`) dipetakan ke 409 `receipt_exists`. `deleteInvoice` memeriksa receipt aktif sebelum soft delete. `listInvoices` menambah `hasReceipt` lewat `EXISTS` pada receipt aktif.
- [ ] **Step 4: Run** `bun run test` dan `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): payment receipt tables and service`

---

### Task 3: PDF receipt dan stempel LUNAS

**Files:**
- Modify: `app/src/lib/server/invoicing/invoice-pdf.ts`, `app/src/lib/server/reports/pdf-scaffold.ts`
- Create: `app/src/routes/api/invoicing/invoices/[id]/receipt/pdf/+server.ts`
- Test: `app/tests/integration/invoicing-payment-receipt-pdf.test.ts`; `app/tests/integration/invoicing-invoice-pdf.test.ts` (tambah satu tes regresi, tes yang ada tidak diubah)

**Interfaces:**
- Consumes: `PaymentReceiptDetail`, `getPaymentReceiptForInvoice` (Task 2), `getInvoiceCompanyData`, `drawInvoicePdf`.
- Produces: `drawReceiptPdf(doc: PDFKit.PDFDocument, d: { company: InvoiceCompanyData; receipt: PaymentReceiptDetail }): void` di `invoice-pdf.ts`; `createPdfDocument(opts: { layout?; margin?; bufferPages?: boolean })`; rute `GET /api/invoicing/invoices/[id]/receipt/pdf` (peran `viewer`, 404 `notFound('Receipt')` bila tidak ada receipt aktif, nama file `receipt-${receiptNo.replaceAll('/', '-')}.pdf`).
- Tata letak: refaktor `drawInvoicePdf` menjadi satu fungsi gambar bersama yang menerima model dokumen ternormalisasi (judul, subjudul, baris nomor/tanggal kanan atas, perihal, kontak, baris, nominal, mata uang, catatan, apakah kartu pembayaran dicetak, label tanda tangan, teks paragraf opsional, apakah ada stempel). `drawInvoicePdf` dan `drawReceiptPdf` hanya membentuk model itu. Jangan menyalin renderer.
- Stempel: ikuti mockup stempel (`…advance-receipt-lunas-stamp-mockup.html`): teks "LUNAS" tebal berjarak, bingkai membulat, warna `#168a4a` dengan opacity ≈ 0.45, di tengah halaman, miring ≈ −20°, digambar **di atas** konten di setiap halaman (aktifkan `bufferPages` opsional di `createPdfDocument` lalu gambar stempel per halaman di akhir, atau teknik lain yang hasilnya setara). Ukuran skala dari mockup ke pt seperti di komentar `invoice-pdf.ts`.

- [ ] **Step 1: Write the failing tests** (pola `invoicing-invoice-pdf.test.ts`: `setup`, `parse` dengan `pdf-parse`). Receipt penuh (perusahaan lengkap, kontak lengkap, perihal, catatan, mata uang IDR) mengandung `PAYMENT RECEIPT`, `Kuitansi Pembayaran`, `Nomor Kuitansi / Receipt Number`, nomor receipt, `Tanggal Pembayaran / Payment Date`, `Nomor Invoice / Invoice Number`, nomor invoice asal, `LUNAS`, `TERBILANG / Amount in Words`, paragraf bukti pembayaran lengkap dengan perihal, catatan, `Acknowledged by,`, nama penanda tangan. Tidak mengandung `INFORMASI PEMBAYARAN`, `Approved by`, `Jatuh Tempo`, maupun `BCA` (info bank). Tanpa perihal: paragraf memuat `pembelian pada Invoice {nomor invoice}`. Receipt USD: `$1,250.00` dan `Dolar Amerika Serikat`. Receipt 60 baris: `LUNAS` ada di **setiap** halaman, `Acknowledged by,` tepat sekali dan di halaman terakhir, setiap baris tepat sekali, header kolom diulang di halaman lanjutan. Snapshot: invoice diubah setelah terbit, PDF receipt tetap memuat nilai lama. Tanpa receipt aktif: 404. Peran bukan anggota: 401/403 seperti rute PDF invoice. Regresi: PDF invoice tidak mengandung `LUNAS`, `PAYMENT RECEIPT`, atau `Acknowledged by`.
- [ ] **Step 2: Run** `bun test tests/integration/invoicing-payment-receipt-pdf.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** refaktor renderer, `drawReceiptPdf`, opsi `bufferPages`, dan rute PDF. Pembungkusan kata/teks tetap memakai helper renderer yang ada.
- [ ] **Step 4: Run** `bun run test` (semua tes PDF invoice yang ada harus tetap lulus tanpa perubahan) dan `bun run check`. Expected: PASS.
- [ ] **Step 5: Visual check.** Buat receipt contoh (data lengkap, logo, tanda tangan, watermark `../watermark.png`, satu halaman, dan versi 60 baris) ke folder scratchpad, buka dengan Read, bandingkan dengan mockup invoice dan mockup stempel. Periksa stempel tidak membuat angka tabel tidak terbaca, tidak terpotong di tepi, urutan blok benar, dan paragraf tidak terpotong. Perbaiki bila berbeda.
- [ ] **Step 6: Commit** `feat(app): payment receipt PDF with LUNAS stamp`

---

### Task 4: API, UI, dan e2e

**Files:**
- Create: `app/src/routes/api/invoicing/invoices/[id]/receipt/+server.ts`
- Modify: `app/src/routes/(app)/invoicing/invoices/[id]/+page.server.ts`, `app/src/routes/(app)/invoicing/invoices/[id]/+page.svelte`, `app/src/routes/(app)/invoicing/invoices/+page.svelte`
- Test: `app/tests/integration/invoicing-payment-receipt-api.test.ts`, `app/tests/e2e/invoicing-smoke.spec.ts`, `app/tests/integration/rbac-matrix.test.ts` (bila matriks mendaftar rute)

**Interfaces:**
- Consumes: `issuePaymentReceipt`, `getPaymentReceiptForInvoice`, `deletePaymentReceipt`, `IssuePaymentReceiptInput` (Task 2), `InvoiceListRow.hasReceipt`, rute PDF (Task 3).
- Produces: `POST /api/invoicing/invoices/[id]/receipt` (peran `accountant`, body `{ paymentDate }`, balasan `{ id }`), `GET` (peran `viewer`, balasan `PaymentReceiptDetail`, 404 bila tidak ada), `DELETE` (peran `accountant`, balasan `{ ok: true }`). Loader halaman detail invoice menambah `receipt: PaymentReceiptDetail | null`.
- UI detail invoice: bila belum ada receipt dan pengguna `accountant` ke atas, tombol "Terbitkan Receipt" membuka dialog dengan `DateField` "Tanggal pembayaran" (default hari ini) dan tombol Simpan. Bila sudah ada, kartu "Payment Receipt" menampilkan nomor, tanggal pembayaran, tautan "Unduh PDF Receipt", dan tombol "Hapus Receipt" (memakai `DeleteDocumentDialog`, judul "Hapus receipt"). Di halaman yang sama, bila receipt ada, tampil catatan "Receipt sudah terbit. Perubahan pada invoice ini tidak mengubah receipt." Pesan error server (termasuk kode kosong dan `invoice_has_receipt`) tampil seperti pola error halaman itu. Daftar invoice: kolom "Receipt" bernilai "Terbit" bila `hasReceipt`, kosong bila tidak (tidak perlu pencarian).

- [ ] **Step 1: Write the failing tests.** Integrasi (pola handler `GET`/`POST`/`DELETE` dengan `fakeEvent`): `POST` oleh `accountant` menghasilkan `{ id }` dan receipt bernomor `001/UJI-PLG/RCP/…`; `viewer` mendapat 403 untuk `POST` dan `DELETE` tetapi 200 untuk `GET`; tanpa login 401; `paymentDate` kosong atau tidak valid 400; `POST` kedua 409; `DELETE` lalu `GET` 404. E2E (tambahkan ke alur `invoicing-smoke.spec.ts` setelah langkah Ubah, sebelum penghapusan invoice): klik "Terbitkan Receipt", dialog menampilkan tanggal hari ini, simpan; heading atau teks nomor cocok `/^001\/E2E-PLG\/RCP\/[IVX]+\/\d{4}$/`; tautan "Unduh PDF Receipt" mengarah ke `/api/invoicing/invoices/<id>/receipt/pdf`; catatan "Receipt sudah terbit." terlihat; mencoba menghapus invoice dari daftar menampilkan "Hapus receipt terlebih dahulu"; daftar invoice menampilkan "Terbit"; hapus receipt lewat dialog, lalu penghapusan invoice berhasil seperti semula.
- [ ] **Step 2: Run** `bun test tests/integration/invoicing-payment-receipt-api.test.ts`. Expected: FAIL. E2E dijalankan di Step 4.
- [ ] **Step 3: Implement** rute API, loader, dan UI mengikuti pola halaman detail yang ada (`canManage`, `apiFetch`, `ClientApiError`).
- [ ] **Step 4: Run** `bun run test`, `bun run check`, dan `bunx playwright test` (build otomatis). Expected: semua PASS.
- [ ] **Step 5: Commit** `feat(app): issue and delete payment receipts from the invoice page`
