# Export Data (Excel / CSV / PDF) — Design Spec

## Intent

Pengguna butuh data dan laporan dari pena di luar aplikasi: data mentah (Jurnal, Buku Besar) untuk diolah lebih lanjut di spreadsheet, dan laporan keuangan resmi (Neraca Saldo, Laporan Posisi Keuangan, Laba Rugi) untuk dicetak atau dikirim ke pihak lain (bank, investor, kantor pajak). Ini salah satu dari empat permintaan besar pengguna (export, input manual — sudah selesai, logo — sudah selesai, invoicing); dokumen ini hanya mencakup export.

## Why now

Permintaan pengguna: "tambah Export data dalam excel, csv, dan pdf." Pengguna setuju dengan pembagian format berikut (dikonfirmasi langsung): data tabular (Jurnal, Buku Besar) di-export sebagai **Excel & CSV**; laporan keuangan resmi (Neraca Saldo, Laporan Posisi Keuangan, Laba Rugi) di-export sebagai **PDF**.

## Goals

- Tombol unduh di halaman Jurnal dan Buku Besar: **Excel (.xlsx)** dan **CSV**, berisi data yang sedang ditampilkan (menghormati filter tanggal/akun yang aktif di halaman).
- Tombol unduh di halaman Neraca Saldo, Laporan Posisi Keuangan, dan Laba Rugi: **PDF**, berisi laporan yang sama persis dengan yang tampil di layar (termasuk kolom pembanding tahun lalu yang sudah ada di Laporan Posisi Keuangan & Laba Rugi), dengan kop surat berisi logo perusahaan (jika ada) berdampingan dengan nama & alamat perusahaan — melanjutkan keputusan dari fitur logo perusahaan (logo dipakai juga di laporan PDF, berdampingan, bukan menggantikan teks).
- Setiap unduhan dibuat on-demand saat tombol ditekan (tidak disimpan/diarsipkan di server).

## Non-goals

- **Tidak ada export untuk Dashboard, Riwayat Upload, atau halaman Review** — tidak diminta, di luar scope permintaan pengguna.
- **Tidak ada "export semua akun" untuk Buku Besar** — halaman Buku Besar saat ini selalu menampilkan satu akun pada satu waktu (parameter `account_id` wajib); export mengikuti apa yang tampil di layar (satu akun), bukan fitur baru untuk mengekspor seluruh chart of accounts sekaligus.
- **Tidak ada format lain** di luar Excel/CSV (Jurnal, Buku Besar) dan PDF (Neraca Saldo, Laporan Posisi Keuangan, Laba Rugi) — tidak ada PDF untuk Jurnal/Buku Besar, tidak ada Excel/CSV untuk laporan keuangan, kecuali pengguna memintanya nanti.
- **Tidak ada penjadwalan/automasi** (export berkala, kirim email otomatis) — ini permintaan manual, sekali tekan sekali unduh.
- **Tidak ada riwayat/arsip file yang pernah diunduh** — setiap unduhan di-generate ulang dari data terkini, tidak ada tabel baru untuk menyimpan riwayat export.

## Anti-goals (gagal walau "jalan")

- Angka di file Excel/CSV yang berupa teks berformat Indonesia (mis. "1.234,00") bukan angka murni — pengguna tidak bisa langsung menjumlahkan/mengolahnya di spreadsheet. Nilai uang di Excel/CSV **harus** berupa angka (numeric), bukan string berformat.
- PDF laporan keuangan yang angkanya tidak sama persis dengan yang tampil di layar aplikasi (beda pembulatan, beda baris) — laporan yang dibagikan ke pihak luar jadi tidak bisa dipercaya.
- Export yang bisa diakses lewat URL langsung tanpa pengecekan role/perusahaan yang sama seperti halaman aslinya — akan membocorkan data keuangan perusahaan lain.
- CSV yang menampilkan karakter rusak (mojibake) saat dibuka di Excel karena encoding tidak diberi tanda UTF-8 — harus bisa dibuka langsung dengan benar oleh Excel tanpa langkah impor manual.

## Current state (dari eksplorasi codebase)

- **Belum ada library untuk Excel/PDF/CSV sama sekali** di `package.json` — perlu dependency baru (tidak seperti fitur Input Manual yang sengaja tanpa dependency baru; di sini memang dibutuhkan).
- **Jurnal** (`src/routes/(app)/journal/`, `listJournal(companyId, from, to)` di `src/lib/server/journal/queries.ts`): filter `?from=&to=` (default bulan ini). Data: daftar entry `{id, entryDate, refNo, description, type: 'OPENING'|'TRANSACTION'|'CLOSING', lines: [{accountId, accountCode, accountName, debit, credit}]}`. Di layar, baris kedua dst. dari entry yang sama mengosongkan kolom tanggal/ref/keterangan (grouping visual) — **export tidak boleh meniru ini**; lihat Decisions di bawah.
- **Buku Besar** (`src/routes/(app)/ledger/`, `getLedger(companyId, accountId, from, to)` di `src/lib/server/reports/ledger.ts`): wajib `?account_id=&from=&to=`. Data: `{account: {code, name, normalBal}, openingBalance, lines: [{entryDate, refNo, description, debit, credit, balance}], totalDebit, totalCredit, closingBalance}`. Sudah flat (satu baris = satu transaksi + saldo berjalan), siap diekspor langsung.
- **Neraca Saldo** (`src/routes/(app)/trial-balance/`, `getTrialBalance(companyId, range, {includeClosing})` di `src/lib/server/reports/trial-balance.ts`): filter `?from=&to=` atau `?as_of=`, plus `?closing=1`. Data flat per akun: `{code, name, openingDebit, openingCredit, debit, credit, closingDebit, closingCredit}` + `totals` + `balanced`. Tampilan: 1 tabel, header 2 baris (Saldo Awal/Mutasi/Saldo Akhir × Debit/Kredit).
- **Laporan Posisi Keuangan** (`src/routes/(app)/balance-sheet/`, `getBalanceSheetComparative(companyId, asOf)` di `src/lib/server/reports/balance-sheet.ts`): filter `?as_of=` saja. Data pohon rekursif per bagian (Aset Lancar/Tidak Lancar, Liabilitas Jangka Pendek/Panjang, Ekuitas) dengan subtotal berjenjang, DUA kolom (`current` & `comparative` = akhir tahun fiskal sebelumnya).
- **Laba Rugi** (`src/routes/(app)/income-statement/`, `getIncomeStatementComparative(companyId, range)` di `src/lib/server/reports/income-statement.ts`): filter `?from=&to=` atau `?as_of=`. Data flat per section (`revenue/cogs/opex/otherIncome/otherExpense/tax`) dengan subtotal (`grossProfit/operatingProfit/profitBeforeTax/netProfit`), DUA kolom (current & comparative = periode yang sama tahun lalu).
- **Formatter yang sudah ada dan dipakai ulang**: `formatIdr`/`formatAccounting` (`$lib/money.ts`) untuk tampilan PDF; `formatDate`/`formatDateLong`/`formatPeriod` (`$lib/dates.ts`, `$lib/periods.ts`) untuk label tanggal/periode di PDF, sama seperti yang tampil di layar.
- **Data perusahaan untuk kop surat PDF**: tabel `companies` punya `name`, `npwp`, `address`, `logoUrl`; logo mentah (bytes) diambil lewat `getCompanyLogo(companyId)` (`$lib/server/company/logo.ts`), bukan lewat `logoUrl` (yang hanya URL `<img>`). Helper `getCompanyReportInfo` yang sudah dipakai trial-balance/balance-sheet/income-statement saat ini hanya mengambil `{name, fiscalYear}` — builder perlu memperluasnya (atau menambah query baru) untuk juga mengambil `npwp`, `address`, dan logo mentah.
- **Tempat tombol**: `PageHeader`'s `actions` snippet (sudah ada, dipakai trial-balance/balance-sheet untuk Badge balance). Jurnal, Buku Besar, Laba Rugi belum punya `actions` — perlu ditambahkan.
- Semua 5 halaman ini dijaga `requirePageRole(event, 'viewer')` — level akses export sama: **viewer ke atas**, karena ini operasi baca (tidak mengubah data).

## Decisions made with the user

- Jurnal & Buku Besar → **Excel & CSV**. Neraca Saldo, Laporan Posisi Keuangan, Laba Rugi → **PDF**.
- Logo perusahaan (kalau ada) tampil di kop surat PDF, berdampingan dengan nama & alamat perusahaan (keputusan dari spec logo, diteruskan ke sini).

## Decisions left to the builder (this document's calls)

- **Library:** `exceljs` untuk `.xlsx` (murni JS, tanpa native binding), `pdfkit` untuk PDF (murni JS, API teks/gambar/posisi yang cukup untuk layout laporan dengan kop surat + tabel + subtotal). CSV tidak perlu library (format sederhana, ditulis manual dengan escaping RFC4180). Proyek ini berjalan di runtime **Bun** (`svelte-adapter-bun`) — kalau salah satu library ini ternyata tidak kompatibel dengan Bun saat dicoba, builder boleh mengganti dengan alternatif yang murni JS (hindari yang butuh Chromium/headless browser atau native binding), dan melaporkannya (BLOCKED) daripada memaksa.
- **Nilai uang di Excel/CSV: angka murni**, bukan string berformat Indonesia — mis. `1234.00` sebagai number, bukan `"1.234,00"`. Ini beda dari tampilan di layar (`formatIdr`), yang berformat Indonesia. Alasan: file export dimaksudkan untuk diolah ulang di spreadsheet (Non-goals/Anti-goals di atas); kalau berupa teks, pengguna tidak bisa langsung menjumlahkan.
- **CSV: angka dengan titik desimal (mis. `1234.00`), pemisah kolom koma, diawali UTF-8 BOM** (`﻿`) di awal file agar Excel membuka teks Indonesia (nama akun, keterangan) dengan benar tanpa karakter rusak. Alasan: ini kombinasi standar yang paling kompatibel dibuka langsung oleh Excel tanpa wizard impor manual, dan tidak ambigu (tidak campur titik-desimal-Indonesia dengan koma-pemisah-kolom).
- **Baris Excel/CSV Jurnal: satu baris = satu baris jurnal (bukan satu baris = satu entry).** Field tingkat-entry (`entryDate`, `refNo`, `description`, `type`) **diulang di setiap baris**, TIDAK dikosongkan seperti pengelompokan visual di layar. Alasan: file untuk diolah ulang (filter/urutkan/pivot) harus punya nilai lengkap di setiap baris; pengosongan visual di layar adalah pilihan UX untuk dibaca manusia, bukan untuk data tabular. Kolom: Tanggal, No. Ref, Keterangan Entry, Tipe, Kode Akun, Nama Akun, Debit, Kredit.
- **Buku Besar: export mengikuti akun yang sedang dipilih di layar** (bukan "semua akun sekaligus", lihat Non-goals). Kolom: Tanggal, No. Ref, Keterangan, Debit, Kredit, Saldo — plus baris pertama "Saldo Awal" dan baris terakhir total/saldo akhir, meniru struktur tampilan di layar.
- **PDF laporan keuangan: layout & isi mengikuti tampilan di layar apa adanya**, termasuk kolom pembanding (Laporan Posisi Keuangan & Laba Rugi) dan header 2 baris (Neraca Saldo) — bukan desain baru. Angka memakai `formatAccounting`/`formatIdr` (format Indonesia + tanda kurung untuk negatif), sama seperti di layar, karena PDF ini untuk dibaca/dicetak, bukan diolah ulang.
- **Kop surat PDF** (di atas setiap laporan PDF): logo (kalau `getCompanyLogo` mengembalikan data, di kiri, ukuran kecil) berdampingan dengan nama perusahaan (tebal) dan alamat + NPWP (kalau ada, lebih kecil di bawah nama) di sebelahnya; nama laporan (mis. "Neraca Saldo") dan periode/tanggal-per di bawah blok itu.
- **Format gambar logo vs. `pdfkit` (ditemukan saat builder-check):** logo perusahaan selalu disimpan sebagai WebP (`src/lib/logo-crop.ts` meng-encode `canvas.toBlob(..., 'image/webp', ...)` saat upload), tapi `pdfkit` hanya bisa menyisipkan PNG/JPEG, bukan WebP. Builder call: tambah **satu** dependency kecil tambahan — decoder WebP berbasis WASM murni JS (mis. `@jsquash/webp`), dipakai HANYA di jalur generate-PDF untuk mendekode bytes WebP perusahaan menjadi PNG sesaat sebelum dipanggil `pdfkit`'s `.image()`. Ini tidak menyentuh fitur logo yang sudah selesai (tidak ada perubahan skema, tidak ada migrasi, tidak perlu re-upload logo lama) — murni langkah konversi di dalam kode export PDF yang baru. Kalau logo perusahaan kosong (belum pernah upload), kop surat tetap tampil tanpa gambar (hanya nama & alamat), sama seperti PageHeader di layar yang juga menyembunyikan `<img>` saat `logoUrl` null.
- **Indikator balance di PDF (ditemukan saat builder-check):** Badge "Balance"/"Tidak balance" (Neraca Saldo) dan daftar tanggal yang tidak balance (Laporan Posisi Keuangan, kalau ada) termasuk ISI laporan, bukan hanya dekorasi UI — builder call: tampilkan juga di PDF (di bawah kop surat/judul laporan), supaya PDF yang dibagikan ke pihak luar tidak menyembunyikan informasi yang sama yang dilihat pengguna di layar. Ini konsisten dengan prinsip "PDF mengikuti tampilan di layar apa adanya" yang sudah ditetapkan di atas.
- **Endpoint:** satu route per laporan, mis. `GET /api/reports/journal/export?format=xlsx|csv&from=&to=`, `/api/reports/ledger/export?format=xlsx|csv&account_id=&from=&to=`, `/api/reports/trial-balance/export?from=&to=|as_of=&closing=` (selalu PDF, parameter `format` tidak perlu kalau cuma satu pilihan), `/api/reports/balance-sheet/export?as_of=`, `/api/reports/income-statement/export?from=&to=|as_of=`. Setiap route membaca ulang parameter yang sama dan memakai fungsi query yang sama (`listJournal`, `getLedger`, dst.) seperti halaman aslinya — supaya data yang diekspor selalu konsisten dengan data yang terakhir dilihat pengguna di layar, dan mewarisi validasi range/error yang sudah ada. Role: `requireRole(event, 'viewer')`, sama seperti halaman.
- **Nama file:** `<nama-laporan>_<tanggal/rentang>.<ext>`, mis. `jurnal_2026-08-01_2026-08-31.xlsx`, `buku-besar_1-1001_2026-08-01_2026-08-31.csv`, `neraca-saldo_2026-08-01_2026-08-31.pdf`, `laporan-posisi-keuangan_2026-10-18.pdf`, `laba-rugi_2026-08-01_2026-08-31.pdf`. Tidak perlu menyertakan nama perusahaan di nama file (builder boleh menambah kalau trivial, tapi bukan keharusan).
- **Tombol:** di `PageHeader`'s `actions` snippet setiap halaman — Jurnal & Buku Besar dapat 2 tombol ("Unduh Excel", "Unduh CSV"); Neraca Saldo, Laporan Posisi Keuangan, Laba Rugi dapat 1 tombol ("Unduh PDF"), diletakkan berdampingan dengan Badge yang sudah ada (trial-balance/balance-sheet). Tombol memicu navigasi langsung ke URL export (link `<a>`/`download`, bukan fetch+blob) dengan query string filter yang sedang aktif di halaman — browser yang menangani unduhan, tidak perlu JavaScript tambahan untuk memicu "Save As".

## Constraints

- Dependency baru: `exceljs`, `pdfkit`, dan satu decoder WebP murni JS/WASM (mis. `@jsquash/webp`, dipakai hanya untuk konversi logo di jalur PDF) — atau alternatif Bun-compatible yang murni JS/WASM kalau salah satunya bermasalah. Ini SATU-SATUNYA fitur di batch ini yang boleh menambah dependency; fitur-fitur lain (input manual) sengaja tanpa dependency baru.
- Tidak ada migrasi skema database untuk fitur ini sendiri (kecuali memperluas `getCompanyReportInfo`'s SELECT, yang tidak butuh migrasi karena kolomnya sudah ada semua).
- Role akses export = role akses halaman aslinya: **viewer ke atas**.
- Setiap export route memvalidasi company/role dengan cara yang sama persis seperti halaman page-nya (`requirePageRole`/`requireRole` dari `$lib/server/rbac`), supaya tidak ada jalur baru yang bisa membocorkan data perusahaan lain.

## What's left to the builder

- Tata letak persis PDF (ukuran font, margin, lebar kolom) — asal terbaca jelas dan sesuai struktur yang sudah dijelaskan di atas.
- Urutan dan label tombol unduh persis ("Unduh Excel" vs "Excel (.xlsx)", dsb.) — konsisten Bahasa Indonesia, senada dengan label tombol lain di aplikasi ini.
- Apakah kop surat PDF menyertakan label "Laporan Posisi Keuangan per {tanggal}" dalam satu baris atau dua baris — detail tipografi, tidak mengubah isi.
