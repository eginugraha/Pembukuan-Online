# Input Transaksi Manual (tanpa eStatement) — Design Spec

## Intent

Beberapa perusahaan punya rekening bank yang bukan BCA. Parser eStatement yang ada sekarang hanya mengerti PDF BCA (lewat sidecar), jadi pengguna dengan rekening bank lain sama sekali tidak bisa memasukkan data transaksinya ke sistem. Fitur ini memberi jalur kedua: pengguna bisa mengetik transaksi satu per satu secara manual, berdasarkan mutasi rekening (PDF/kertas) yang mereka punya sendiri, lalu transaksi itu diproses lewat alur yang **sama persis** dengan transaksi hasil upload PDF (saran kategori otomatis, konfirmasi akun, generate jurnal). Ini satu dari empat permintaan besar pengguna (export, input manual, logo — sudah selesai, invoicing); dokumen ini hanya mencakup input manual.

## Why now

Pengguna menjelaskan: "kemungkinan akun bank tidak hanya BCA, jadi bisa saja pengguna tidak melakukan upload tapi memasukan datanya secara manual satu persatu berdasarkan PDF yang dia punya." Upload PDF tetap ada dan tidak dihapus — ini tambahan jalur, bukan pengganti.

## Goals

- Pengguna (role `accountant` ke atas, sama seperti upload PDF) bisa membuat satu batch transaksi manual: isi info rekening + saldo awal (opsional), lalu tambah baris transaksi satu-satu (tanggal, keterangan, arah debit/kredit, jumlah).
- Batch itu otomatis ikut alur yang sudah ada tanpa perubahan: masuk kategorisasi otomatis (rule/AI), muncul di Riwayat Upload, direview & dikonfirmasi di halaman detail upload yang sudah ada, lalu generate jurnal dengan tombol yang sudah ada.
- Nomor referensi jurnal (`refNo`) untuk transaksi non-BCA tidak lagi salah menyebut "BCA" (lihat bug di Current State).

## Non-goals

- **Tidak ada transaksi kas/non-rekening-bank.** Setiap transaksi (manual atau PDF) tetap selalu melawan satu akun bank yang didesain di `companies.bankAccountId` — ini keterbatasan arsitektur yang sudah ada sebelum fitur ini, dan mengubahnya (mendukung akun lawan bebas, mis. kas) adalah perubahan arsitektur jauh lebih besar yang di luar scope "input manual tanpa eStatement". Kalau nanti dibutuhkan, itu brainstorming terpisah.
- **Tidak ada parser PDF baru untuk bank lain.** Ini justru jalan pintas yang menggantikan kebutuhan parser tersebut untuk sekarang.
- **Tidak ada import CSV/bulk-paste.** Pengguna sendiri bilang "satu persatu" — satu baris pada satu waktu lewat form, bukan unggah file data.
- **Tidak mengubah apa pun di alur upload PDF BCA yang sudah ada** (parser, deteksi duplikat, dsb.) selain perbaikan `refNo` di atas, yang backward-compatible.

## Anti-goals (gagal walau "jalan")

- Baris manual yang tidak lewat kategorisasi/rule otomatis yang sudah ada — harus terasa seperti "upload PDF tanpa file", bukan fitur terpisah dengan UX berbeda.
- `refNo` jurnal yang masih menyebut "BCA" untuk transaksi yang jelas-jelas bukan BCA (laporan jadi menyesatkan).
- Baris transaksi yang bisa disimpan dengan jumlah nol/negatif atau tanpa tanggal — harus divalidasi sama ketatnya dengan input saldo awal (`$lib/schemas/opening.ts` sudah punya pola ini, dipakai ulang).

## Current state (dari eksplorasi codebase)

- **Alur upload PDF** (`src/lib/server/uploads/service.ts`, fungsi `createUpload`): validasi file → `deps.parse(file)` (panggil sidecar BCA) → hasil `ParsedStatement` (`account_no`, `period_start`, `period_end`, `opening_balance`, `closing_balance`, `transactions: ParsedTransaction[]`) → dalam satu transaksi DB: cek duplikat (akun+periode tumpang-tindih di `statement_uploads`), insert satu baris `statement_uploads` (status `processing`), insert banyak baris `transactions` dari `parsed.transactions` → `deps.enqueue(uploadId)` yang memicu `enqueueCategorization` (job in-process, lihat `src/lib/server/jobs.ts`) untuk menyarankan akun per baris via rule/AI, lalu status upload berubah ke `review`.
- **Kolom `statement_uploads.bank`** (`src/lib/server/db/schema.ts`) adalah `varchar(20)` bebas dengan default `'BCA'` — **bukan enum**. Sistem sebenarnya sudah siap menyimpan bank apa pun; hanya langkah parsing PDF yang BCA-spesifik. Tidak perlu migrasi skema untuk fitur ini.
- **Halaman review/konfirmasi** (`src/routes/(app)/uploads/[id]/+page.svelte`, dan `/review` global) sudah generik: menampilkan transaksi milik satu upload apa pun, tidak peduli asalnya dari PDF atau bukan. Tidak perlu diubah.
- **`generateJournal`** (`src/lib/server/journal/generate.ts:47-81`) mengambil `upload` by id, mewajibkan `company.bankAccountId` terisi, lalu untuk setiap transaksi yang belum punya jurnal: bangun dua baris jurnal lewat `buildTransactionLines` (lawan transaksinya **selalu** `company.bankAccountId`) — **bug ditemukan:** `refNo` jurnal di-hardcode `` `BCA-${yyyymm}-${seq}` `` (baris ~70), padahal `upload.bank` sudah tersedia di scope yang sama. Transaksi manual non-BCA akan mendapat `refNo` yang salah menyebut "BCA" kalau ini tidak diperbaiki.
- **Konvensi debit/kredit** (`src/lib/server/journal/lines.ts:31-46`, fungsi `buildTransactionLines`): `transactions.debit` = uang keluar dari rekening bank (akun kategori di-debit, bank di-kredit); `transactions.credit` = uang masuk ke rekening bank (bank di-debit, akun kategori di-kredit) — sama seperti kolom "Debit"/"Kredit" di mutasi rekening bank pada umumnya, jadi label form manual bisa memakai istilah yang sama tanpa terjemahan.
- **Pola skema + service yang bisa ditiru langsung**: `src/lib/schemas/opening.ts` + `src/lib/server/journal/opening.ts` sudah punya pola "form dengan baris berulang, masing-masing baris punya field uang" (`lines: z.array(z.object({accountId, debit: moneyString, credit: moneyString}))`), dan `src/lib/schemas/common.ts` sudah punya helper `isoDate`, `moneyString`, `requiredText`, `requiredId` yang dipakai bersama klien & server. Skema baru untuk fitur ini memakai helper yang sama.
- **Deteksi duplikat** di `createUpload` (`service.ts`, bagian `tx.select(...).from(statementUploads).where(eq(accountNo)+overlap periode)`) sama sekali tidak bergantung pada `bank` — jadi berlaku otomatis dan benar untuk batch manual juga, tanpa perlu kode tambahan.

## Decisions made with the user

- Ini tambahan jalur (ada 2: upload eStatement dan input manual), bukan pengganti upload eStatement.
- Transaksi manual tetap untuk rekening bank (kemungkinan bank selain BCA) yang datanya pengguna ketik sendiri berdasarkan PDF/mutasi yang mereka punya — bukan transaksi kas/non-bank.
- Input satu baris transaksi pada satu waktu ("satu persatu"), bukan import file.

## Decisions left to the builder (this document's calls)

- **Lokasi UI:** `/uploads/new` mendapat dua tab: "Upload PDF" (form yang sudah ada, tidak diubah) dan "Input Manual" (baru) — satu pintu masuk yang konsisten dengan mental model "tambah data transaksi" yang sudah ada, bukan item navigasi baru.
- **Field form manual:**
  - Nama bank (teks, wajib — bebas, bukan dropdown tertutup, karena kolom DB-nya memang bebas).
  - Nomor rekening (teks, wajib — dipakai juga untuk deteksi duplikat per akun+periode, sama seperti PDF).
  - Saldo awal (opsional, `moneyString`) — kalau diisi, dipakai untuk peringatan selisih saldo yang sama seperti jalur PDF (`openingBalanceWarning` di `service.ts`, dipakai ulang tanpa diubah).
  - Baris transaksi berulang (minimal 1 untuk submit): Tanggal (`isoDate`), Keterangan (teks), Arah (Debit = uang keluar / Kredit = uang masuk — radio atau toggle, label persis seperti mutasi bank), Jumlah (`moneyString`, harus > 0). Tombol "Tambah Baris" / hapus baris.
  - Periode (start/end) dan saldo akhir **tidak diminta ke pengguna** — dihitung otomatis dari tanggal min/max baris yang diisi dan dari saldo awal + akumulasi debit/kredit baris (meniru cara `opening_balance`/`closing_balance` dihitung dari transaksi PDF).
- **Skema baru** `src/lib/schemas/upload.ts`, mengikuti pola `opening.ts`:
  ```ts
  export const ManualEntryInput = z.object({
  	bank: requiredText('Nama bank', 20),
  	accountNo: requiredText('Nomor rekening', 30),
  	openingBalance: moneyString.optional(),
  	rows: z.array(z.object({
  		date: isoDate,
  		description: requiredText('Keterangan', 200),
  		direction: z.enum(['DB', 'CR']),
  		amount: moneyString
  	})).min(1, 'Isi minimal satu baris transaksi')
  });
  ```
  (Nama field, batas panjang teks, dan pesan error persis ini adalah contoh yang masuk akal, bukan harga mati — builder boleh menyesuaikan kalau ada alasan kuat, tapi strukturnya harus seperti ini: satu objek dengan `rows` array.)
- **Service:** refactor kecil di `src/lib/server/uploads/service.ts` — ekstrak bagian "insert upload row + insert transactions + enqueue" dari `createUpload` (baris 46 ke bawah, setelah `parsed` didapat) jadi fungsi privat yang menerima objek berbentuk `ParsedStatement` plus `bank`. `createUpload` tetap memanggilnya setelah parse PDF; fungsi baru `createManualEntry(input: {companyId, userId, bank, accountNo, openingBalance, rows}, deps: {enqueue})` membangun `ParsedStatement`-shape (hitung `period_start`/`period_end`/`closing_balance` dari `rows`, isi `transactions[]` dari `rows` dengan `line_no` berurutan) lalu memanggil fungsi privat yang sama. Ini memastikan deteksi duplikat, insert, dan enqueue kategorisasi 100% konsisten antara dua jalur, tanpa duplikasi logika.
- **Route baru:** `POST /api/uploads/manual` (`src/routes/api/uploads/manual/+server.ts`), `requireRole(event, 'accountant')`, body JSON divalidasi `ManualEntryInput`, balas `{id}` — klien redirect ke `/uploads/${id}` sama seperti jalur PDF (`uploads/new/+page.svelte` sudah punya pola ini, tab manual memanggil endpoint ini sebagai ganti `POST /api/uploads`).
- **Perbaikan `refNo` (ditemukan lebih dalam saat builder-check):** literal `'BCA'` bukan satu-satunya tempat bermasalah. `maxRefSeq` (`journal/generate.ts:9-15`) memfilter dengan `like (refNo, 'BCA-${yyyymm}-%')` lalu mengambil angka urut dengan `substring(refNo from 12)` — posisi `12` cuma benar untuk prefix 3 huruf, dan `bank` adalah teks bebas (bisa ada spasi, huruf kecil, bahkan karakter `%`/`_` yang berarti khusus untuk `LIKE`). Builder call: **ganti seluruh skema `refNo` jadi generik, tidak bergantung nama bank sama sekali** — format `` `JE-${yyyymm}-${seq.toString().padStart(4,'0')}` ``, satu nomor urut per **perusahaan per bulan** (bukan per bank). Alasan: (1) sistem ini sudah mengasumsikan satu `companies.bankAccountId` per perusahaan (lihat poin di bawah), jadi scoping per-bank tidak menambah manfaat nyata; (2) menghindari semua masalah sanitasi teks bebas; (3) `maxRefSeq` jadi aman diubah ke `like (refNo, 'JE-${yyyymm}-%')` + `substring(refNo from 11)` (panjang `JE-yyyymm-` selalu 10 karakter, tetap). Konsekuensi: jurnal yang sudah ada sebelum fitur ini tetap berformat `BCA-...` (riwayat tidak diubah), jurnal baru sesudahnya berformat `JE-...` — ini perubahan kosmetik yang disengaja, berlaku untuk SEMUA jurnal baru (upload PDF maupun manual), bukan cuma manual.
- **Asumsi satu rekening bank per perusahaan (ditemukan saat builder-check):** `companies.bankAccountId` adalah satu FK, bukan daftar — ini keterbatasan yang sudah ada di seluruh aplikasi, bukan sesuatu yang diperkenalkan atau harus diperbaiki fitur ini. Fitur ini mengasumsikan batch manual tetap mewakili SATU rekening bank yang sama yang sudah didesain di Pengaturan → Perusahaan (entah karena rekening itu bukan BCA, atau karena PDF untuk periode itu tidak ada) — bukan "rekening kedua di samping BCA". Kalau nanti pengguna benar-benar perlu melacak dua rekening bank sekaligus, itu perubahan arsitektur terpisah di luar scope ini (dan di luar scope upload PDF yang sudah ada juga, karena keterbatasan yang sama berlaku di sana).
- **Saldo awal kosong & saldo berjalan per baris (ditemukan saat builder-check):** kalau pengguna tidak mengisi saldo awal, builder call: isi otomatis dari saldo buku rekening bank per tanggal mulai periode (pakai `balanceAtStartOf` yang sudah dipakai `openingBalanceWarning`, bukan `0`) — supaya tidak muncul peringatan selisih saldo yang salah dan angka yang tampil di Riwayat Upload tidak menyesatkan. Kolom `transactions.balance` per baris dihitung berjalan (saldo awal + akumulasi kredit-dikurangi-debit) dengan baris diurutkan berdasarkan tanggal (lalu urutan input kalau tanggalnya sama) — meniru cara PDF mengisi kolom saldo berjalan.
- **Memperbaiki kesalahan sebelum vs sesudah kirim (ditemukan saat builder-check):** tidak ada, dan fitur ini TIDAK menambahkan, cara mengubah satu baris transaksi setelah batch dibuat — ini konsisten dengan upload PDF yang sudah ada (tidak ada edit per-baris untuk hasil parse PDF juga). Builder call: (1) sebelum baris-baris dikirim, form menampilkan daftar baris yang sudah diisi dalam bentuk yang bisa diedit/dihapus per baris sebelum tombol submit akhir ditekan — supaya kesalahan ketik tertangkap sebelum tersimpan, bukan sesudah; (2) sesudah batch tersimpan, cara memperbaiki kesalahan sama seperti upload PDF yang sudah ada: hapus seluruh batch lewat `DELETE /api/uploads/[id]` (sudah ada, role admin) lalu input ulang. Tidak ada endpoint edit-per-baris baru yang dibuat.
- **Nama file batch manual:** kolom `statement_uploads.filename` diisi string deskriptif, mis. `` `Input manual — ${periodStart} s/d ${periodEnd}` ``, supaya masuk akal saat tampil di kolom "File" pada Riwayat Upload.

## Constraints

- Tidak ada migrasi skema database — semua kolom yang dibutuhkan sudah ada dan cukup bebas (khususnya `bank` yang `varchar` bebas, bukan enum).
- Tidak ada dependency baru.
- Validasi jumlah baris transaksi & nominal harus seketat `OpeningInput` yang sudah ada (pakai helper `common.ts` yang sama), termasuk pesan error Bahasa Indonesia yang konsisten.
- Role akses sama seperti upload PDF: `accountant` ke atas untuk membuat batch, `viewer` ke atas untuk melihat (otomatis ikut karena memakai `statement_uploads`/`transactions` yang sama).

## What's left to the builder

- Tata letak persis form (urutan field, tombol tambah/hapus baris, apakah pakai tabel atau card per baris).
- Pesan error & label persis selama konsisten Bahasa Indonesia dan senada dengan field sejenis yang sudah ada (`opening.ts`, `company.ts`).
- Apakah tab "Input Manual" di `/uploads/new` pakai routing terpisah (`/uploads/new/manual`) atau state lokal (misal `bits-ui` Tabs) — pilih yang paling konsisten dengan pola tab lain di codebase ini kalau ada, atau state lokal kalau tidak ada presedan.
