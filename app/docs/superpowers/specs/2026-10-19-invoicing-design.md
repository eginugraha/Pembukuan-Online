# Invoicing (Invoice, Uang Muka, Purchase Order) — Design Spec

## Intent

Perusahaan butuh membuat dan mencetak dokumen transaksi standar — Invoice (tagihan ke pelanggan), Uang Muka (uang yang diterima dari pelanggan sebelum invoice dibuat), dan Purchase Order (pesanan pembelian ke vendor) — bukan hanya mencatat transaksi dari eStatement/input manual. Ini yang terakhir dari empat permintaan besar pengguna (export — sudah selesai, input manual — sudah selesai, logo — sudah selesai); dokumen ini mencakup ketiganya sekaligus karena mereka berbagi satu model data (kontak, penomoran dokumen, PDF) dan dikerjakan sebagai satu spec + satu plan (keputusan pengguna).

## Why now

Permintaan pengguna: "Tambahkan fitur Pembuatan Invoice, advance receipt, dan purchase order." Pengguna mengonfirmasi empat keputusan arsitektur sebelum spec ini ditulis:

- Invoice/PO/Uang Muka **memposting jurnal double-entry otomatis** (bukan sekadar dokumen tanpa pembukuan) — memakai akun Piutang Usaha, Utang Usaha, PPN, dan Uang Muka & Deposit yang sudah ada di template chart of accounts.
- Pelacakan pembayaran invoice **status sederhana saja** (Draft/Terkirim/Lunas/Batal) — tidak ada pembayaran sebagian/cicilan atau due-date/overdue di versi ini.
- PPN punya **kalkulator bawaan** (satu tarif per dokumen, otomatis menghitung dari subtotal) — bukan cuma baris manual.
- Ketiga fitur (Kontak, Invoice, Uang Muka, Purchase Order) dikerjakan sebagai **satu spec, satu plan**, karena berbagi model data yang sama.

## Goals

- **Kontak**: satu data master pelanggan/vendor (nama, alamat, NPWP, email, telepon), dipakai oleh Invoice (pelanggan) dan Purchase Order (vendor).
- **Invoice**: buat invoice (pelanggan, tanggal, baris item dengan akun pendapatan per baris, PPN opsional), kirim (posting jurnal: Debit Piutang Usaha, Kredit Pendapatan + PPN Keluaran), tandai Lunas (posting jurnal pembayaran — dari bank ATAU dari Uang Muka yang jumlahnya pas sama), batalkan (posting jurnal pembalik jika sudah terposting), unduh PDF.
- **Uang Muka**: catat uang muka yang diterima dari pelanggan (posting jurnal: Debit Bank, Kredit Pendapatan Diterima Dimuka), bisa diterapkan ke SATU invoice pelanggan yang sama persis jumlahnya untuk melunasinya, unduh PDF (kwitansi).
- **Purchase Order**: buat PO (vendor, tanggal, baris item dengan akun beban per baris, PPN opsional) — **PO sendiri TIDAK memposting jurnal** (baru komitmen, belum kejadian ekonomi); baru saat ditandai "Diterima" PO memposting jurnal (Debit Beban + PPN Masukan, Kredit Utang Usaha), batalkan (posting jurnal pembalik jika sudah Diterima), unduh PDF.
- Semua nomor dokumen (`INV-2026-0001`, `UM-2026-0001`, `PO-2026-0001`) otomatis berurutan per perusahaan per tahun.
- PDF setiap dokumen memakai kop surat yang sama (logo + nama + alamat perusahaan) seperti laporan keuangan — infrastruktur `createPdfDocument`/`drawLetterhead`/`getCompanyLetterheadData` yang sudah dibangun untuk fitur Export dipakai ulang, tidak dibangun baru.

## Non-goals

- **Tidak ada manajemen stok/inventaris** — baris PO langsung ke akun beban, bukan ke stok barang.
- **Tidak ada pembayaran sebagian/cicilan untuk invoice**, dan **tidak ada penerimaan sebagian untuk PO** — status biner (belum/sudah), sesuai keputusan pengguna.
- **Uang Muka hanya bisa diterapkan ke SATU invoice, dan harus sama persis jumlahnya** — tidak ada penerapan sebagian ke satu invoice atau pemecahan satu uang muka ke beberapa invoice. Kalau jumlahnya tidak pas, uang muka tetap bisa dicatat tapi pelunasan invoice harus lewat jalur bank biasa.
- **Tidak ada multi-mata uang** — semua dalam IDR, konsisten dengan asumsi satu mata uang di seluruh aplikasi (`companies.currency` sudah default `'IDR'`).
- **Tidak ada pengiriman email otomatis** — PDF diunduh manual, sama seperti fitur Export (tidak ada automasi/penjadwalan).
- **Tidak ada invoice berulang (recurring)** dan **tidak ada nota kredit/revisi invoice** — hanya Draft→Terkirim→Lunas/Batal.
- **Tidak ada multi-rekening bank** — penerimaan uang muka dan pembayaran invoice selalu ke `companies.bankAccountId`, akun bank tunggal yang sudah menjadi asumsi di seluruh aplikasi (lihat fitur Input Manual).
- **Tidak ada PPN per-baris** — satu tarif PPN per dokumen (Invoice/PO), dihitung dari subtotal semua baris, bukan tarif berbeda per baris.

## Anti-goals (gagal walau "jalan")

- Jurnal yang sudah terposting (invoice Terkirim, PO Diterima) **dihapus** saat dibatalkan, bukan dibalik — ini akan merusak laporan keuangan periode yang sudah ditutup atau yang sedang dilihat orang lain. Pembatalan dokumen yang sudah terposting **harus** membuat jurnal pembalik (debit/kredit terbalik, tanggal hari ini atau tanggal pembatalan), bukan menghapus jurnal asli.
- Dokumen yang sudah terposting **dihapus total (hard delete)** dari database — hanya dokumen **Draft** (belum pernah posting jurnal) yang boleh dihapus; dokumen yang sudah posting hanya bisa dibatalkan (lihat di atas).
- Posting jurnal invoice/PO/uang muka pada tanggal yang jatuh di periode yang sudah ditutup (tutup buku) — harus memakai `assertPeriodOpen` yang sudah ada, sama seperti semua jalur posting jurnal lain di aplikasi ini.
- Uang Muka diterapkan ke invoice milik kontak yang BERBEDA, atau ke invoice yang jumlahnya tidak pas sama — harus divalidasi dan ditolak dengan pesan jelas, bukan diterima diam-diam dengan jurnal yang salah.
- Invoice/PO dibuat dengan baris kosong, jumlah nol/negatif, atau tanpa akun pendapatan/beban per baris — harus divalidasi seketat `ManualEntryInput`/`OpeningInput` yang sudah ada.

## Current state (dari eksplorasi codebase)

- **Tidak ada data kontak/pelanggan/vendor sama sekali** — ini benar-benar baru, tidak ada tabel atau halaman yang bisa ditabrak.
- **Chart of Accounts** (`src/lib/server/company/coa-data.ts` untuk template `general`, `coa-it.ts` untuk template `it`) sudah punya akun yang relevan: `1-1003` Piutang Usaha, `2-1001` Utang Usaha, `2-1005` Utang PPN/PPN Keluaran (nama berbeda per template, keduanya LIABILITY/CREDIT), `2-1007` Pendapatan Diterima Dimuka (LIABILITY/CREDIT). Nama & kode akun PPN Masukan/Pajak Dibayar Dimuka **berbeda antar template** — jadi fitur ini **tidak boleh hardcode kode akun**; pengguna memilih akun PPN & akun pendapatan/beban per dokumen/baris sendiri dari Chart of Accounts yang sudah ada, sama seperti baris Saldo Awal memilih akun sendiri.
- **Pola posting jurnal** (`src/lib/server/journal/generate.ts`, `lines.ts`, `opening.ts`): transaksi DB (`db.transaction`), row-lock perusahaan (`select ... for update`) sebelum generate nomor urut (mencegah nomor bentrok saat klik ganda), `assertPeriodOpen(tx, companyId, dates)` sebelum insert, `assertBalanced(lines)` sebelum insert `journal_lines`, insert `journal_entries` lalu `journal_lines`. Fitur ini mengikuti pola yang sama persis untuk setiap posting (Terkirim invoice, Diterima PO, Lunas invoice, Terima uang muka, pembalikan saat Batal).
- **`journal_entries.type`** (enum) hanya punya `'OPENING'|'TRANSACTION'|'CLOSING'` — **tidak ditambah nilai baru** (builder call, lihat di bawah: jurnal invoicing memakai `'TRANSACTION'`, dibedakan lewat kolom link-back baru, bukan lewat `type` baru). `journal_entries` sudah punya pola kolom nullable link-back ke sumbernya (`uploadId`, `transactionId`) — pola yang sama dipakai ulang untuk invoicing (lihat Model data).
- **Penomoran** (`maxRefSeq` di `generate.ts`): pola row-lock + `substring(ref_no from N)::int` max + `Map` in-memory per periode dalam satu transaksi — dipakai ulang (bukan disalin persis, karena skop penomoran di sini per **tahun**, bukan per bulan seperti refNo jurnal) untuk nomor `INV-yyyy-NNNN`/`PO-yyyy-NNNN`/`UM-yyyy-NNNN`.
- **Infrastruktur PDF** (`src/lib/server/reports/pdf-scaffold.ts`, `pdf-letterhead.ts`, `logo-for-pdf.ts` — baru dibangun untuk fitur Export, generik, tidak perlu diubah): `createPdfDocument(opts)`, `finishPdf(doc)`, `pdfResponse(buf, filename)`, `drawLetterhead(doc, company, title, periodLabel)` (mengembalikan koordinat Y setelah kop surat), `getCompanyLetterheadData(companyId)`. Dipakai apa adanya untuk ketiga jenis dokumen (title = "INVOICE"/"PURCHASE ORDER"/"KWITANSI UANG MUKA", periodLabel = nomor dokumen + tanggal).
- **Pola CRUD terdekat**: Chart of Accounts (`settings/accounts` — list + modal, tanpa halaman detail `[id]`) untuk Kontak (data master sederhana); Upload (`uploads/` — list + new + detail `[id]` dengan `withPageErrors`, `canWrite`/`canDelete` dari role) untuk Invoice/PO/Uang Muka (punya siklus status & detail yang kaya).
- **Role & validasi**: semua role check lewat `requireRole`/`requirePageRole` (`$lib/server/rbac.ts`); validasi lewat skema Zod di `$lib/schemas/`, memakai helper (`requiredText`, `requiredId`, `moneyString`, `isoDate`) dari `$lib/schemas/common.ts`.
- **Navigasi** (`src/lib/nav.ts`): komentar di file ini sendiri menyebut fitur-fitur lain memang belum dibangun di slice saat ini — menambah grup nav baru untuk Invoicing adalah praktik yang sudah diharapkan, bukan penyimpangan.

## Decisions made with the user

- Full ledger integration (posting jurnal otomatis untuk ketiganya).
- Status sederhana (bukan pembayaran sebagian/cicilan).
- Kalkulator PPN bawaan (satu tarif per dokumen).
- Satu spec + satu plan untuk Kontak + Invoice + Uang Muka + Purchase Order.

## Decisions left to the builder (this document's calls)

### Model data

- **Tabel `contacts`**: `id, companyId, kind ('CUSTOMER'|'VENDOR'|'BOTH'), name, npwp?, address?, email?, phone?, isActive (default true), createdAt`. Satu tabel untuk pelanggan & vendor (dibedakan lewat `kind`) — PO hanya menampilkan kontak `kind IN ('VENDOR','BOTH')` di pemilih, Invoice hanya `kind IN ('CUSTOMER','BOTH')`.
- **Tabel `invoices`**: `id, companyId, contactId, invoiceNo (nullable, unique per companyId saat terisi — lihat "Penomoran dokumen"), issueDate, receivableAccountId (akun Piutang Usaha yang dipilih pengguna — builder call, lihat di bawah), status ('DRAFT'|'SENT'|'PAID'|'CANCELLED'), subtotal, taxRate (numeric 5,2, nullable), taxAccountId (nullable, wajib diisi kalau taxRate>0), taxAmount (default 0), total, notes?, paidViaAdvanceReceiptId (nullable — diisi kalau Lunas lewat uang muka), createdBy, createdAt`. **Tidak ada kolom `journalEntryId`** — jurnal yang terkait dengan satu invoice dicari lewat `journal_entries.invoiceId` (lihat di bawah), bukan disimpan sebagai field di invoice (satu invoice bisa punya lebih dari satu jurnal sepanjang hidupnya: posting awal, pelunasan, pembalikan).
- **Tabel `invoice_lines`**: `id, invoiceId (cascade), lineNo, description, quantity (numeric 12,2, default 1), unitPrice (money), amount (money = quantity × unitPrice), revenueAccountId`.
- **Tabel `advance_receipts`**: `id, companyId, contactId, receiptNo (unique per companyId — diisi saat dibuat, lihat di bawah: Uang Muka tidak punya tahap Draft), receiptDate, amount, status ('ACTIVE'|'APPLIED'|'REFUNDED'), deferredRevenueAccountId (akun liabilitas yang dikredit, dipilih pengguna), appliedToInvoiceId (nullable), createdBy, createdAt`.
- **Tabel `purchase_orders`**: `id, companyId, contactId, poNo (nullable, unique per companyId saat terisi), issueDate, expectedDate?, payableAccountId (akun Utang Usaha yang dipilih pengguna — builder call, lihat di bawah), status ('DRAFT'|'ISSUED'|'RECEIVED'|'CANCELLED'), subtotal, taxRate?, taxAccountId?, taxAmount (default 0), total, notes?, createdBy, createdAt`.
- **Tabel `purchase_order_lines`**: `id, poId (cascade), lineNo, description, quantity, unitPrice, amount, expenseAccountId`.
- **Tiga kolom nullable baru di tabel `journal_entries` yang sudah ada**: `invoiceId` (FK→invoices, `set null`), `purchaseOrderId` (FK→purchase_orders, `set null`), `advanceReceiptId` (FK→advance_receipts, `set null`) — **builder call** (ditemukan saat builder-check): ini bukan pelanggaran aturan "tidak ada migrasi yang mengubah tabel yang sudah ada", karena pola ini meniru PERSIS kolom `uploadId`/`transactionId` yang sudah ada di `journal_entries` untuk keperluan yang sama (menghubungkan jurnal ke sumbernya) — murni aditif (nullable, tidak mengubah kolom lain, tidak memengaruhi query yang sudah ada). Setiap jurnal yang dibuat oleh fitur ini (posting awal, pelunasan, pembalikan) mengisi SATU dari tiga kolom ini (sesuai dokumen sumbernya) dan tetap memakai `type: 'TRANSACTION'` — tidak perlu nilai enum baru. Mencari "semua jurnal milik invoice X" tinggal `WHERE invoiceId = X`, tidak perlu field `journalEntryId` apa pun di tabel invoice/PO/uang-muka.
- `refNo` jurnal yang dibuat fitur ini = nomor dokumennya sendiri (`invoiceNo`/`poNo`/`receiptNo`, mis. `INV-2026-0001`) — bukan sequence `JE-yyyymm-NNNN` yang sudah ada (keduanya namespace berbeda dan tidak perlu unik secara global, sama seperti `BCA-...` dan `JE-...` yang sudah hidup berdampingan). Jurnal pembalik memakai `refNo` yang SAMA dengan jurnal aslinya (menandakan satu pasang), dibedakan lewat `description` (mis. `"Pembalikan INV-2026-0001"`).
- Semua tabel baru mengikuti konvensi kolom yang sudah ada di `schema.ts` (`uuid().primaryKey().defaultRandom()`, `money()`, `day()`, `createdAt()`, FK `companyId` cascade ke `companies`).

### Akun Piutang Usaha / Utang Usaha (ditemukan saat builder-check)

Spec ini melarang hardcode kode akun (lihat Current state) — tapi tidak menyebutkan dari mana akun Piutang Usaha (invoice) dan Utang Usaha (PO) berasal. **Builder call:** sama seperti akun pendapatan/beban per baris dan akun PPN, ini juga **dipilih pengguna** saat membuat dokumen — kolom `receivableAccountId` (invoices) / `payableAccountId` (purchase_orders), wajib diisi, dipilih dari Chart of Accounts yang sama seperti field akun lain di form ini. Tidak ada default/lookup-by-code otomatis (kode akun berbeda-beda kemungkinannya kalau pengguna mengubah CoA), dan tidak mengubah tabel `companies` (yang akan melanggar aturan "tidak ada migrasi yang mengubah tabel yang sudah ada").

### Tanggal posting (ditemukan saat builder-check)

**Builder call:** setiap aksi yang memposting jurnal (Kirim invoice, Terima PO, Tandai Lunas) punya field tanggal sendiri di form aksinya (default hari ini, bisa diubah pengguna — sama seperti tanggal bebas dipilih di Input Manual/Saldo Awal), **bukan** otomatis `issueDate` dokumen. Tanggal inilah yang dicek `assertPeriodOpen` dan dipakai sebagai `entryDate` jurnal. Jurnal pembalik (saat Batal) selalu bertanggal **hari ini saat pembatalan dilakukan** — tidak bisa dipilih pengguna, supaya pembalikan selalu di periode yang masih terbuka tempat pembatalan itu terjadi.

### Alur posting jurnal (per dokumen)

- **Invoice Terkirim** (Draft→Sent): `Debit receivableAccountId (sejumlah total)` / `Kredit <akun pendapatan per baris> (sejumlah subtotal per baris)` + `Kredit <taxAccountId> (sejumlah taxAmount)` kalau ada PPN. Baris jurnal per baris-invoice (bukan digabung jadi satu baris pendapatan), supaya laporan per-akun pendapatan tetap benar kalau baris memakai akun berbeda-beda. Jurnal ini mengisi `journal_entries.invoiceId`.
- **Invoice Lunas via Bank**: `Debit companies.bankAccountId` / `Kredit receivableAccountId`, sejumlah `total` invoice. Jurnal ini juga mengisi `invoiceId`.
- **Invoice Lunas via Uang Muka**: `Debit <deferredRevenueAccountId milik uang muka itu>` / `Kredit receivableAccountId`, sejumlah `total` invoice (yang harus sama persis dengan `amount` uang muka — divalidasi sebelum posting). Uang Muka berubah status `ACTIVE`→`APPLIED`, `appliedToInvoiceId` diisi. Jurnal ini mengisi KEDUA kolom `invoiceId` dan `advanceReceiptId` (satu jurnal, dua sumber).
- **Invoice Batal**: kalau belum ada jurnal sama sekali (masih Draft), cukup ubah status ke `CANCELLED`, tidak ada jurnal apa pun. Kalau sudah terposting (status `SENT` atau `PAID`), ambil SEMUA jurnal dengan `invoiceId = <id ini>` dan buat jurnal pembalik untuk masing-masing (baris debit/kredit asli ditukar, `refNo` sama, `description` menyebut `"Pembalikan <invoiceNo>"`, `entryDate` = hari ini). **Kalau invoice itu Lunas lewat Uang Muka**, pembalikan juga mengembalikan uang muka ke status `ACTIVE` dan mengosongkan `appliedToInvoiceId`-nya — supaya uang muka itu bisa dipakai lagi (lihat Anti-goals: tidak boleh ada uang yang "terdampar").
- **Uang Muka dicatat**: **tidak ada tahap Draft** — Uang Muka dibuat sekaligus langsung terposting (mencatat sesuatu yang sudah terjadi, bukan rencana). `Debit companies.bankAccountId` / `Kredit <deferredRevenueAccountId>`, sejumlah `amount`, bertanggal `receiptDate` (bukan "hari ini" — ini satu-satunya tanggal yang dipilih pengguna sendiri saat membuat dokumen, karena tidak ada tahap "kirim" terpisah). Jurnal ini mengisi `advanceReceiptId`.
- **Uang Muka Batal/Refund**: hanya boleh kalau status masih `ACTIVE` (belum `APPLIED` ke invoice manapun) — buat jurnal pembalik (bertanggal hari ini), status jadi `REFUNDED`.
- **PO Draft→Issued**: **tidak memposting jurnal** — hanya mengubah status dan memberi `poNo` (lihat Penomoran dokumen). Alasan: PO baru komitmen, belum kejadian ekonomi, tapi nomor PO tetap harus ada begitu dikirim ke vendor (tercetak di PDF).
- **PO Diterima** (Issued→Received): `Debit <akun beban per baris> (subtotal per baris)` + `Debit <taxAccountId> (taxAmount)` kalau ada PPN / `Kredit payableAccountId (total)`. Jurnal ini mengisi `purchaseOrderId`.
- **PO Batal**: sama seperti Invoice Batal — kalau belum `RECEIVED`, cukup ubah status (tidak ada jurnal untuk dibalik, karena Issued tidak pernah posting); kalau sudah `RECEIVED`, cari jurnal dengan `purchaseOrderId = <id ini>` dan buat jurnal pembalik.
- Semua posting di atas memakai `assertPeriodOpen` dan `assertBalanced` yang sudah ada, dalam `db.transaction` dengan row-lock perusahaan sama seperti `generateJournal`.

### Penomoran dokumen

- Helper baru `src/lib/server/invoicing/numbering.ts`, meniru `maxRefSeq` di `journal/generate.ts` (row-lock, `substring(... from N)::int` max, `Map` per periode dalam satu transaksi) tapi skop **per tahun** (bukan per bulan): `nextDocumentNumber(tx, companyId, prefix: 'INV'|'UM'|'PO', year: string): Promise<string>` → `` `${prefix}-${year}-${seq.toString().padStart(4,'0')}` ``. Setiap jenis dokumen punya sequence sendiri (nomor `INV` dan `PO` tidak berbagi urutan).
- **Kapan nomor diberikan (ditemukan saat builder-check):** `invoiceNo`/`poNo` **BUKAN** diisi saat dokumen dibuat (masih Draft) — kolomnya nullable, dokumen Draft tampil sebagai "Draft" di UI, belum punya nomor. Nomor baru diberikan tepat saat transisi status pertama yang membuatnya resmi: **Kirim** untuk invoice, **Issued** untuk PO — di dalam transaksi yang sama (row-lock yang sama) seperti posting jurnalnya (kalau ada). Alasan: dokumen Draft boleh dihapus (lihat Anti-goals), dan kalau nomor sudah diberikan sejak Draft, menghapus Draft akan membuat lompatan nomor (`INV-2026-0001` lalu `0003` karena `0002` dihapus) — tidak sesuai praktik akuntansi Indonesia yang mengharapkan nomor berurutan tanpa lompatan untuk dokumen yang benar-benar diterbitkan. `receiptNo` (Uang Muka) diisi langsung saat dibuat, karena Uang Muka tidak punya tahap Draft (lihat Alur posting jurnal).

### Peran & akses

- Membuat/mengubah Kontak, Invoice, Uang Muka, PO (termasuk status Draft): **accountant ke atas** — sama seperti membuat upload/entry manual.
- Transisi status yang memposting jurnal (Terkirim, Lunas, Diterima, Terapkan Uang Muka): **accountant ke atas** — sama seperti Generate Jurnal di fitur upload.
- Membatalkan dokumen yang **sudah terposting** (butuh jurnal pembalik): **admin** — sama seperti `DELETE /api/uploads/[id]` yang butuh admin karena menyentuh data yang sudah mempengaruhi laporan.
- Membatalkan/menghapus dokumen **Draft** (belum terposting): **accountant ke atas** cukup (belum menyentuh buku).
- Melihat daftar & detail (termasuk unduh PDF): **viewer ke atas**, konsisten dengan semua laporan lain di aplikasi ini.

### PDF

- Satu modul baru `src/lib/server/invoicing/pdf.ts` memakai `createPdfDocument`/`drawLetterhead`/`getCompanyLetterheadData`/`finishPdf`/`pdfResponse` apa adanya (tidak diubah). Setelah `drawLetterhead(doc, company, 'INVOICE'|'PURCHASE ORDER'|'KWITANSI UANG MUKA', `${nomor} — ${tanggal}`)`, gambar blok info kontak (nama, alamat, NPWP kalau ada) di bawah, lalu tabel baris item (Keterangan, Qty, Harga Satuan, Jumlah), lalu Subtotal/PPN/Total, lalu status dokumen. Angka pakai `formatIdr`, memakai `pdf-scaffold`'s font A4 yang sudah ada — tidak perlu halaman landscape (jumlah baris invoice/PO biasanya tidak sebanyak laporan keuangan, tapi kalau baris banyak, logika page-break yang sudah diperbaiki di fitur Export (margin A4 50pt + `lineBreak:false` per sel) dipakai ulang, bukan dibangun ulang).

### Navigasi

- Grup nav baru `'Invoicing'` di `src/lib/nav.ts`, diletakkan setelah grup `'Jurnal'`/`'Buku'` dan sebelum `'Laporan Keuangan'`: item "Kontak" (`/invoicing/contacts`, viewer untuk lihat & accountant untuk kelola — ikuti pola `min` per item yang sudah ada), "Invoice" (`/invoicing/invoices`, viewer), "Uang Muka" (`/invoicing/advance-receipts`, viewer), "Purchase Order" (`/invoicing/purchase-orders`, viewer). Tombol "Buat Baru" di setiap halaman list, gated `accountant` di dalam halaman (sama seperti `canUpload` di halaman Riwayat Upload), bukan item nav terpisah.

### Struktur rute

- `src/routes/(app)/invoicing/contacts/` (list + modal create/edit, pola sama seperti `settings/accounts`), `invoices/` (list, `new/`, `[id]/`), `advance-receipts/` (list, `new/`, `[id]/`), `purchase-orders/` (list, `new/`, `[id]/`).
- `src/routes/api/invoicing/contacts/`, `invoices/` (+ `[id]/`, `[id]/send`, `[id]/pay`, `[id]/cancel`, `[id]/pdf`), `advance-receipts/` (+ `[id]/`, `[id]/cancel`, `[id]/pdf`), `purchase-orders/` (+ `[id]/`, `[id]/issue`, `[id]/receive`, `[id]/cancel`, `[id]/pdf`) — pola status-transition-sebagai-sub-route meniru `retryCategorization` di `uploads/service.ts` (aksi sebagai endpoint sendiri, bukan `PATCH` generik). PO punya satu endpoint lebih banyak dari Invoice (`issue` sebelum `receive`) karena PO punya tiga tahap sebelum Batal (Draft→Issued→Received), sementara Invoice hanya dua (Draft→Sent) — lihat Alur posting jurnal.

## Constraints

- Tidak ada migrasi yang mengubah tabel yang sudah ada **kecuali** menambah tiga kolom nullable di `journal_entries` (`invoiceId`/`purchaseOrderId`/`advanceReceiptId`, lihat Model data — aditif murni, pola yang sama seperti `uploadId`/`transactionId` yang sudah ada di tabel itu). Tabel `companies`/`accounts`/`journal_lines` dan kolom `journal_entries` lainnya dipakai apa adanya, tidak ada migrasi lain.
- Tidak ada dependency baru — `pdfkit`/`exceljs`/`@jsquash/*` yang sudah ada dari fitur Export cukup; Kontak/Invoice/Uang Muka/PO tidak butuh library tambahan apa pun.
- Setiap posting jurnal memakai `assertPeriodOpen` dan `assertBalanced` yang sudah ada, tidak ada logika balance-checking baru.
- Validasi form seketat `ManualEntryInput`/`OpeningInput` (nominal harus > 0, tanggal wajib, baris minimal 1), pesan error Bahasa Indonesia konsisten.

## What's left to the builder

- Tata letak persis form (urutan field, apakah baris item pakai tabel atau card) dan PDF (ukuran font, lebar kolom) — mengikuti gaya `settings/opening-balance`/fitur Export yang sudah ada.
- Label tombol & teks status persis (mis. "Tandai Lunas" vs "Bayar Sekarang") — konsisten Bahasa Indonesia.
- Ikon nav baru untuk grup Invoicing di `AppSidebar.svelte` — pilih ikon lucide yang masuk akal (mis. `file-text`/`receipt`/`shopping-cart`).
