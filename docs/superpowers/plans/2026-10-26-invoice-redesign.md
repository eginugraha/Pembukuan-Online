# Desain Ulang Invoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF invoice tampil seperti mockup yang disetujui, data pendukungnya (perusahaan, kontak, perihal) bisa diisi, dan nomor invoice/PO berformat `001/SET-XFORMATION/INV/IV/2026`.

**Architecture:** Satu migrasi menambah kolom baru di `companies`, `contacts`, dan `invoices`, satu tabel `company_assets` (tanda tangan dan watermark), serta memperlebar kolom nomor. Fungsi murni baru (`terbilang`, `formatDocumentNumber`) diuji unit. Renderer PDF invoice baru (`invoice-pdf.ts`) menggantikan `drawLetterhead` + `drawDocumentPdf` khusus untuk invoice. PO tetap memakai renderer lama dan hanya ikut format nomor baru.

**Tech Stack:** SvelteKit 2 + Svelte 5, Drizzle (Postgres) + drizzle-kit, zod 4, pdfkit 0.20.2, `@jsquash` (WebP→PNG), `bun test` (unit + integrasi, `pdf-parse` untuk membaca PDF), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-10-26-invoice-redesign-design.md`. Mockup: `docs/superpowers/specs/assets/2026-10-26-invoice-mockup.html`. Mockup `…advance-receipt-lunas-stamp…` **bukan** bagian dari pekerjaan ini.

Semua perintah dijalankan dari folder `app/`.

## Global Constraints

- Format nomor: `NNN/<KODEPERUSAHAAN>-<KODEKONTAK>/<INV|PO>/<BULAN-ROMAWI>/<TAHUN>`. `NNN` minimal 3 digit (`001`, `999`, `1000`). Bulan I–XII dan tahun diambil dari tanggal dokumen.
- Urutan dihitung per perusahaan, per jenis, per tahun, dan **mulai lagi dari 001**, terpisah dari counter format lama. Kunci counter baru memakai prefix `INV:v2` / `PO:v2` di `document_number_counters.prefix` (varchar 10). Baris counter lama tidak disentuh.
- Nomor ditetapkan sekali saat dibuat. Mengubah dokumen tidak pernah mengubah nomor dan tidak memeriksa kode.
- Kode perusahaan dan kontak: `^[A-Z0-9]{1,15}$` setelah `trim()` + `toUpperCase()`. Opsional di form. **Wajib saat membuat** invoice/PO.
- `invoices.invoice_no` dan `purchase_orders.po_no` menjadi varchar(50).
- Semua field baru opsional kecuali kode (saat membuat dokumen). PDF melewati bagian yang datanya kosong (lihat spec, "Perilaku bila data opsional kosong").
- Font PDF Helvetica / Helvetica-Bold / Helvetica-Oblique. Label PDF dwibahasa persis seperti mockup. Form aplikasi tetap Bahasa Indonesia.
- Gambar tanda tangan/watermark: PNG/JPEG/WebP (magic bytes), maksimal 512 KB, transparansi dipertahankan. Watermark opacity 0.75, di setiap halaman, di belakang konten.
- Tidak boleh ada data Ekuator (nama, watermark, rekening) di kode. Mockup hanya contoh.
- Ikuti pola yang ada: `apiHandler` / `parseJson` / `ApiError(status, code, message, undefined, { field })` / `FormState` / `FormField`, `requireRole(event, 'admin')` untuk ubah pengaturan perusahaan, `requireRole(event, 'viewer')` untuk GET gambar.

## Review Focus

- Perusahaan lama tanpa kode atau kontak lama tanpa kode, lalu pengguna menekan Simpan di invoice baru: pesan yang jelas, dokumen tidak dibuat, dan counter tidak bertambah (Task 3, karena pemeriksaan terjadi sebelum `nextDocumentNumber` di dalam transaksi yang sama).
- Mengubah invoice lama berformat `INV-2026-0001` milik kontak tanpa kode: harus tetap bisa disimpan, dan nomornya tetap (Task 3).
- Kode diketik huruf kecil atau dengan spasi (`" set "`) menjadi `SET`. Kode dengan tanda hubung (`SET-A`) ditolak (Task 2).
- Invoice 60 baris + catatan panjang: tidak ada baris yang hilang, header kolom diulang, dan blok tanda tangan muncul tepat satu kali di halaman terakhir bersama minimal blok di atasnya (Task 6).
- Watermark WebP transparan atau gambar rusak: PDF tetap terbentuk. Gambar rusak dianggap tidak ada, seperti logo (Task 6).

---

### Task 1: Fungsi murni: terbilang dan format nomor dokumen

**Files:**
- Create: `app/src/lib/terbilang.ts`, `app/src/lib/document-number.ts`
- Test: `app/tests/unit/terbilang.test.ts`, `app/tests/unit/document-number.test.ts`

**Interfaces:**
- Produces: `terbilang(amount: string): string` dan `toRoman(month: number): string` (1–12). Juga `formatDocumentNumber(o: { seq: number; companyCode: string; contactCode: string; kind: 'INV' | 'PO'; issueDate: string }): string`, dengan `issueDate` ISO `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing tests**

```ts
// terbilang.test.ts
expect(terbilang('10000000.00')).toBe('Sepuluh Juta Rupiah');
expect(terbilang('0')).toBe('Nol Rupiah');
expect(terbilang('11')).toBe('Sebelas Rupiah');
expect(terbilang('100')).toBe('Seratus Rupiah');
expect(terbilang('1000')).toBe('Seribu Rupiah');
expect(terbilang('1500000')).toBe('Satu Juta Lima Ratus Ribu Rupiah');
expect(terbilang('2000000000')).toBe('Dua Miliar Rupiah');
expect(terbilang('3000000000000')).toBe('Tiga Triliun Rupiah');
expect(terbilang('125.50')).toBe('Seratus Dua Puluh Lima Rupiah Lima Puluh Sen');
// document-number.test.ts
expect(formatDocumentNumber({ seq: 1, companyCode: 'SET', contactCode: 'XFORMATION', kind: 'INV', issueDate: '2026-04-15' })).toBe('001/SET-XFORMATION/INV/IV/2026');
expect(formatDocumentNumber({ seq: 1000, companyCode: 'A', contactCode: 'B', kind: 'PO', issueDate: '2026-12-01' })).toBe('1000/A-B/PO/XII/2026');
expect([1, 4, 9, 12].map(toRoman)).toEqual(['I', 'IV', 'IX', 'XII']);
```

- [ ] **Step 2: Run** `bun test tests/unit/terbilang.test.ts tests/unit/document-number.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** `terbilang` memakai `D` dari `$lib/money` untuk memisahkan rupiah dan sen. Kata-kata ditulis Title Case, dengan bentuk "Se-" untuk sepuluh, sebelas, seratus, dan seribu.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): terbilang and document number formatting helpers`

---

### Task 2: Skema DB, migrasi, dan field baru perusahaan/kontak/invoice

**Files:**
- Modify: `app/src/lib/server/db/schema.ts` (`companies`, `contacts`, `invoices.invoiceNo`, `purchaseOrders.poNo`, + tabel baru `companyAssets`)
- Create: migrasi hasil `bun run db:generate` di `app/drizzle/migrations/`
- Modify: `app/src/lib/schemas/common.ts`, `company.ts`, `contact.ts`, `invoice.ts`
- Modify: `app/src/lib/server/company/service.ts` (`updateCompany`), `app/src/lib/server/invoicing/contacts.ts` (`ContactRow`, create/update)
- Test: `app/tests/unit/schemas.test.ts` (atau `invoicing-*-schema.test.ts`), `app/tests/integration/companies-api.test.ts`, `app/tests/integration/invoicing-contacts.test.ts`

**Interfaces:**
- Produces: kolom-kolom berikut.
  - `companies`: `code varchar(15)`, `email text`, `phone varchar(30)`, `bankName varchar(100)`, `bankAccountNo varchar(50)`, `bankAccountHolder text`, `swiftCode varchar(11)`, `signerName text`, `signerTitle text`, `signatureUrl text`, `watermarkUrl text`. Semuanya nullable.
  - `contacts.code varchar(15)` nullable, dan `invoices.subject text` nullable.
  - `companyAssets` (`company_assets`): `companyId` FK cascade, `kind varchar(20)` (`'signature' | 'watermark'`), `content bytea`, `mime varchar(20)`, `updatedAt`, dengan PK (`companyId`, `kind`).
- Produces: `documentCode` di `schemas/common.ts`, yaitu `z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,15}$/, 'Kode hanya huruf A–Z dan angka, maksimal 15 karakter').nullable().optional()`. String kosong diperlakukan sebagai null. `UpdateCompanyInput` mendapat `code`, `email`, `phone`, `bankName`, `bankAccountNo`, `bankAccountHolder`, `swiftCode`, `signerName`, `signerTitle`. `CreateContactInput` mendapat `code`. `CreateInvoiceInput` mendapat `subject: optionalText('Perihal', 200)`.
- `updateCompany` hanya menulis field baru yang `!== undefined`, seperti pola `bankAccountId`. Tujuannya agar pemanggil yang tidak mengirim field itu tidak menghapusnya.

- [ ] **Step 1: Write failing tests.** Skema: `documentCode.parse(' set ')` menghasilkan `'SET'`, `'SET-A'` ditolak, string 16 karakter ditolak, dan `''` menghasilkan null. Integrasi: `updateCompany` dengan `{ name, code: 'set', bankName: 'BCA' }` lalu `getCompany` mengembalikan `code === 'SET'`. Memanggil `updateCompany` lagi tanpa `bankName` tidak menghapus `bankName`. `createContact` dengan `code: 'rfs'` lalu `getContact(...).code === 'RFS'`.
- [ ] **Step 2: Run** `bun test tests/unit tests/integration/companies-api.test.ts tests/integration/invoicing-contacts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** perubahan skema, lalu `bun run db:generate`. Periksa SQL yang dihasilkan: hanya `ADD COLUMN`, `ALTER COLUMN … TYPE varchar(50)`, dan `CREATE TABLE company_assets`, tanpa DROP. Terapkan ke DB tes, lalu update zod dan service.
- [ ] **Step 4: Run** `bun run test` dan `bun run check`. Expected: PASS, 0 error.
- [ ] **Step 5: Commit** `feat(app): company contact/payment/signer fields, contact code, invoice subject`

---

### Task 3: Penomoran baru dan kode wajib saat membuat dokumen

**Files:**
- Modify: `app/src/lib/server/invoicing/numbering.ts`, `invoices.ts`, `purchase-orders.ts`
- Modify: `app/tests/integration/factory.ts` (`makeCompany` mengisi `code: 'UJI'`; tambahkan helper `makeContact(companyId, kind, opts?)` dengan default `code: 'PLG'`)
- Test: update `invoicing-numbering`, `invoicing-invoice-crud`, `invoicing-po-crud`, `invoicing-final-review`, `invoicing-schema`, `invoicing-po-pdf`, `invoicing-invoice-pdf` (format nomor saja)

**Interfaces:**
- Consumes: `formatDocumentNumber` (Task 1), kolom `code` (Task 2).
- Produces: `nextDocumentNumber(tx: Tx, companyId: string, o: { kind: 'INV' | 'PO'; issueDate: string; companyCode: string; contactCode: string }): Promise<string>`. Counter memakai kunci `(companyId, `${kind}:v2`, tahun issueDate)`. `createInvoice` menyimpan `subject`, dan `updateInvoice` juga mengubah `subject`.
- Error, dilempar sebelum `nextDocumentNumber`: `ApiError(422, 'missing_company_code', 'Isi kode perusahaan di Pengaturan Perusahaan sebelum membuat dokumen')` dan `ApiError(422, 'missing_contact_code', 'Kontak ini belum punya kode. Isi kode kontak terlebih dahulu', undefined, { field: 'contactId' })`.

- [ ] **Step 1: Write failing tests.**
  - Penomoran: dua invoice 2026-04 berurutan `001/UJI-PLG/INV/IV/2026` dan `002/UJI-PLG/INV/IV/2026`. PO pertama `001/UJI-PLG/PO/IV/2026`. Tahun 2027 kembali ke `001`. Kontak lain dengan kode `ABC` tetap melanjutkan urutan (`003/UJI-ABC/…`).
  - Counter lama terisi: insert `document_number_counters` dengan `{ prefix: 'INV', year: '2026', lastSeq: 5 }`, lalu invoice baru tetap bernomor `001/…`.
  - Perusahaan dengan `code = null` gagal 422 `missing_company_code`. Kontak tanpa kode gagal 422 `missing_contact_code`. Setelah kedua kegagalan itu, invoice sukses berikutnya tetap `001`.
  - Update: invoice dibuat, lalu kode kontak di-null-kan dan tanggal diganti ke bulan lain. `updateInvoice` sukses dan `invoiceNo` tidak berubah. `subject` tersimpan dan berubah lewat update.
- [ ] **Step 2: Run** `bun test tests/integration/invoicing-*`. Expected: FAIL.
- [ ] **Step 3: Implement.** `createInvoice`/`createPurchaseOrder` membaca `companies.code` di dalam tx dan mengambil `code` kontak dari hasil `assertContact`. Update semua tes yang memakai format lama.
- [ ] **Step 4: Run** `bun run test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): new document number format restarting at 001, codes required on create`

---

### Task 4: Penyimpanan dan API gambar tanda tangan/watermark

**Files:**
- Create: `app/src/lib/server/company/assets.ts`, `app/src/routes/api/companies/[id]/assets/[kind]/+server.ts`
- Modify: `app/src/lib/server/company/logo.ts` (export `sniffImage` agar bisa dipakai bersama; logo tidak berubah perilaku)
- Test: `app/tests/integration/company-assets.test.ts` (meniru `company-logo.test.ts`)

**Interfaces:**
- Produces: `type CompanyAssetKind = 'signature' | 'watermark'`, `setCompanyAsset(companyId, kind, content: Uint8Array): Promise<string>` (mengembalikan URL `/api/companies/<id>/assets/<kind>?v=<ms>` dan menulis `signatureUrl`/`watermarkUrl`), `removeCompanyAsset(companyId, kind): Promise<void>`, dan `getCompanyAsset(companyId, kind): Promise<{ content; mime; updatedAt } | null>`.
- Rute: PUT (multipart `file`, admin), DELETE (admin), dan GET (viewer, header cache seperti logo). `kind` selain dua nilai itu menghasilkan 404.

- [ ] **Step 1: Write failing tests.** PNG valid lalu GET mengembalikan byte yang sama dan `companies.signatureUrl` terisi. File > 512 KB ditolak 400 `image_too_large`. Teks biasa ditolak 400 `invalid_image`. `kind=foo` menghasilkan 404. Viewer yang mencoba PUT mendapat 403. Perusahaan lain mendapat 404. DELETE mengosongkan URL.
- [ ] **Step 2: Run** `bun test tests/integration/company-assets.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same test plus `company-logo.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): company signature and watermark image storage`

---

### Task 5: UI (Pengaturan Perusahaan, dialog Kontak, form Invoice, detail Invoice)

**Files:**
- Modify: `app/src/routes/(app)/settings/company/+page.svelte` (+ `+page.server.ts` bila perlu data)
- Modify: `app/src/lib/components/ContactDialog.svelte`, `app/src/routes/(app)/invoicing/contacts/+page.svelte` (kolom Kode di tabel)
- Modify: `app/src/lib/components/DocumentForm.svelte`, `invoices/new/+page.server.ts`, `invoices/[id]/edit/+page.server.ts`, `purchase-orders/new/+page.server.ts`
- Modify: `app/src/routes/(app)/invoicing/invoices/[id]/+page.svelte` (tampilkan perihal)
- Test: `app/tests/e2e/invoicing-smoke.spec.ts`, `app/tests/e2e/company-logo.spec.ts` (atau spec baru `company-invoice-settings.spec.ts`)

**Interfaces:**
- Consumes: field dan API dari Task 2 dan Task 4.
- Label form (Bahasa Indonesia): "Kode perusahaan", "Email", "Telepon", "Nama bank", "Nomor rekening", "Atas nama rekening", "Kode SWIFT", "Nama penanda tangan", "Jabatan penanda tangan", "Tanda tangan" (unggah/hapus + pratinjau), "Watermark" (unggah/hapus + pratinjau). Di kontak: "Kode". Di form invoice: "Perihal".
- Halaman `new` mengirim `companyCode: string | null` dan `contacts: { id; name; code }[]`. Peringatan hanya muncul saat membuat (tanpa `docId`):
  - Bila perusahaan belum punya kode: Alert "Kode perusahaan belum diisi." dengan tautan "Isi di Pengaturan Perusahaan" (`/settings/company`).
  - Bila kontak terpilih belum punya kode: Alert "Kontak ini belum punya kode." dengan tautan ke `/invoicing/contacts`.
  - Tombol Simpan dinonaktifkan selama salah satu peringatan tampil.

- [ ] **Step 1: Write failing e2e.** Update smoke: login admin, isi "Kode perusahaan" = `E2E` di `/settings/company` lalu simpan. Kontak baru diisi "Kode" = `PLG`. Invoice dibuat dengan "Perihal" = `Perihal E2E`. Heading cocok dengan `/^001\/E2E-PLG\/INV\/[IVX]+\/\d{4}$/`, dan halaman detail menampilkan `Perihal E2E`. Tambahkan kasus kontak tanpa kode: teks "Kontak ini belum punya kode." terlihat dan tombol Simpan disabled. PO memakai pola `/^001\/E2E-[A-Z0-9]+\/PO\//`.
- [ ] **Step 2: Run** `bun run build && bunx playwright test tests/e2e/invoicing-smoke.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** UI-nya. Unggah tanda tangan/watermark mengirim file mentah ke PUT Task 4, tanpa crop.
- [ ] **Step 4: Run** `bun run check` dan `bunx playwright test`. Expected: PASS untuk seluruh e2e.
- [ ] **Step 5: Commit** `feat(app): invoice settings, contact code, invoice subject in UI`

---

### Task 6: Renderer PDF invoice baru

**Files:**
- Create: `app/src/lib/server/invoicing/invoice-pdf.ts`
- Modify: `app/src/routes/api/invoicing/invoices/[id]/pdf/+server.ts`, `app/src/lib/server/reports/company.ts` (tambahkan loader `getInvoiceCompanyData`)
- Test: `app/tests/integration/invoicing-invoice-pdf.test.ts` (ditulis ulang)

**Interfaces:**
- Consumes: `terbilang` (Task 1), field (Task 2), `getCompanyAsset` (Task 4), `toEmbeddablePng`, `createPdfDocument` / `finishPdf` / `pdfResponse`.
- Produces: `getInvoiceCompanyData(companyId): Promise<InvoiceCompanyData>`. Isinya `name, address, email, phone, bankName, bankAccountNo, bankAccountHolder, swiftCode, signerName, signerTitle`, ditambah `logoPng, signaturePng, watermarkPng: Buffer | null`. Juga `drawInvoicePdf(doc: PDFKit.PDFDocument, d: { company: InvoiceCompanyData; contact: ContactRow; invoice: InvoiceDetail }): void`.
- Tata letak mengikuti mockup (spec, Tujuan 1). Ketentuan pdfkit:
  - Tautan memakai opsi `link` dan `underline: false`.
  - Watermark digambar pertama di setiap halaman, lewat `doc.on('pageAdded')`, dengan `doc.opacity(0.75)` lalu dikembalikan ke 1. Posisinya: lebar ≈ 78% lebar konten, kanan melewati margin ±30pt, dasar ±150pt dari bawah halaman.
  - Ikon amplop dan telepon digambar sebagai path vektor 9pt.
  - Kartu pembayaran memakai `roundedRect` dengan isi #fafafa dan garis #eeeeee.
  - Header tabel dwibahasa diulang di halaman lanjutan.
  - Blok terbilang, kartu pembayaran, catatan, dan tanda tangan dijaga dengan `ensureSpace`. Blok tanda tangan + blok sebelumnya pindah bersama bila tidak muat.

- [ ] **Step 1: Write failing tests** (teks via `pdf-parse`, tautan via `Buffer.from(bytes).toString('latin1')`).
  - Data lengkap: teks memuat `INVOICE`, `Tagihan`, `Nomor Invoice / Invoice Number`, `001/UJI-PLG/INV/X/2026`, `PERIHAL / SUBJECT`, perihalnya, `DITAGIHKAN KEPADA / BILL TO`, `Attn: Budi Santoso, Manajer Keuangan`, telepon kontak, `NPWP 01.234.567.8-901.000`, `RINCIAN TAGIHAN`, `x1`, `1.500.000`, `TERBILANG / Amount in Words`, `Satu Juta Lima Ratus Ribu Rupiah`, `INFORMASI PEMBAYARAN / Payment Information`, `BCA 233-0636800`, `a.n. PT Uji`, `SWIFT CENAIDJA`, catatannya, `Approved by,`, nama dan jabatan penanda tangan. Byte PDF memuat `mailto:finance@uji.test` dan `tel:`.
  - Data minimal (tanpa perihal, bank, catatan, penanda tangan, email, atau telepon): tidak ada `PERIHAL`, `INFORMASI PEMBAYARAN`, `Approved by`, `mailto:`. Total tetap tercetak.
  - Diskon 100.000 dan PPN 11%: ada baris `Subtotal`, `Diskon / Discount`, `PPN / VAT (11%)`. Tanpa keduanya: tidak ada `Subtotal`.
  - 60 baris + catatan: setiap baris muncul tepat sekali, halaman 2 memuat `Keterangan`, `Approved by,` muncul tepat sekali di halaman terakhir, dan halaman terakhir juga memuat `TERBILANG`.
  - Watermark WebP transparan, dan watermark berisi byte rusak (PNG header + sampah): keduanya tetap 200 `application/pdf`.
- [ ] **Step 2: Run** `bun test tests/integration/invoicing-invoice-pdf.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** PO PDF (`purchase-orders/[id]/pdf`) tidak diubah.
- [ ] **Step 4: Run** `bun run test` dan `bun run check`. Expected: PASS.
- [ ] **Step 5: Visual check.** Buat satu PDF contoh dengan seluruh data terisi, logo, tanda tangan, dan watermark `../watermark.png`, lalu simpan ke scratchpad. Buka dengan Read (PDF) dan bandingkan dengan mockup. Periksa bahwa urutan blok sama, watermark tidak menutupi angka tabel, kolom pertama/terakhir rata tepi, dan tidak ada teks terpotong. Perbaiki bila berbeda.
- [ ] **Step 6: Commit** `feat(app): redesigned invoice PDF`
