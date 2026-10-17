# Laporan Berperiode untuk RUPST dan Tutup Buku — Desain

Tanggal: 2026-10-18 · Status: menunggu persetujuan

## Intent

Pemilik menyiapkan laporan untuk **RUPST** (Rapat Umum Pemegang Saham Tahunan). Untuk RUPST, laporan disajikan per **periode** (biasanya satu tahun buku), dan pembukuan setiap tahun **ditutup** (tutup buku).

Saat ini Neraca Saldo dan Posisi Keuangan hanya punya filter "Per tanggal". Aplikasi juga belum punya Laba Rugi dan belum punya proses tutup buku. Laba tahun-tahun lalu dihitung otomatis dan ditampilkan sebagai baris sintetis.

Pemilik meminta **keduanya**, dengan urutan: **laporan dulu (Fase 1), baru tutup buku (Fase 2)**. Spec dan plan ditulis dengan Opus, implementasi dikerjakan Sonnet 5.5.

## Fase 1 — Laporan berperiode

### 1. Neraca Saldo dengan rentang tanggal
- Filter **Dari–Sampai** (dua `DateField`, parameter `from` dan `to`) menggantikan "Per tanggal".
  - Default: awal tahun buku yang memuat hari ini (`fiscalYearStart(todayIso(), companies.fiscalYear)`) sampai akhir bulan berjalan.
  - Tombol Reset mengikuti pola yang ada.
  - Bila `from > to`, tampilkan pesan per field "Tanggal awal harus sebelum tanggal akhir" dan jangan muat ulang.
- Kolom per akun:

  | Kode | Akun | Saldo awal D | Saldo awal K | Mutasi D | Mutasi K | Saldo akhir D | Saldo akhir K |
  |---|---|---|---|---|---|---|---|

  - **Saldo awal** = saldo bersih semua jurnal bertanggal `< from`, ditambah semua jurnal `OPENING` (berapa pun tanggalnya, selama `≤ to`). Ini supaya Saldo Awal yang tanggalnya sama dengan `from` tidak tercatat sebagai mutasi.
  - **Mutasi** = jumlah debit dan jumlah kredit (bruto, bukan bersih) jurnal non-OPENING dalam `[from, to]`.
  - **Saldo akhir** = saldo awal + mutasi, ditampilkan di sisi saldo normalnya bersih (debit bila positif, kredit bila negatif).
- Akun yang ketiga nilainya nol disembunyikan.
- Baris Total untuk keenam kolom. Badge `Balance` (exact) tetap ada dan dihitung dari saldo akhir. Total saldo awal dan total mutasi juga harus seimbang.
- Di HP tabel boleh scroll horizontal di dalam panel. Halaman tidak boleh ikut scroll horizontal.
- API `GET /api/reports/trial-balance?from&to`.
  - Untuk kompatibilitas: bila hanya `as_of` yang dikirim, perlakukan sebagai `from` = awal tahun buku dari `as_of`, `to` = `as_of`.

### 2. Posisi Keuangan dengan kolom pembanding
- Filter tetap **"Per tanggal"** (`as_of`). Menurut PSAK, laporan ini adalah posisi pada satu tanggal, jadi tidak memakai rentang.
- Default berubah menjadi **akhir tahun buku terakhir yang sudah lewat** bila hari ini masih di bulan pertama tahun buku. Selain itu tetap akhir bulan berjalan. *(Diputuskan Claude: menjaga perilaku sekarang, kecuali di awal tahun saat RUPST disiapkan.)*
- Kolom kedua **pembanding** otomatis: tanggal = sehari sebelum awal tahun buku yang memuat `as_of`. Contoh: `as_of` 31 Des 2026 → pembanding 31 Des 2025; `as_of` 30 Jun 2026 → 31 Des 2025.
  - Header kolom menampilkan kedua tanggal.
  - Baris yang muncul adalah gabungan baris yang tidak nol di salah satu kolom.
- Baris "Laba (Rugi) Tahun Berjalan" dihitung dari awal tahun buku sampai `as_of` (sama seperti sekarang). Baris "Laba (Rugi) Tahun-tahun Lalu" tetap sintetis di Fase 1.
- Validasi Total Aset = Total Liabilitas + Ekuitas dilakukan untuk tiap kolom.
- API `GET /api/reports/balance-sheet?as_of` mengembalikan `{ current, comparative }`. Keduanya berbentuk laporan yang sama dengan sekarang.

### 3. Laporan Laba Rugi (baru)
PRD F-08 sudah meminta laporan ini, dan RUPST membutuhkannya.
- Menu baru "Laba Rugi" di grup laporan sidebar, di atas Posisi Keuangan. Path `/income-statement`, peran minimum `viewer`.
- Filter **Dari–Sampai**, default sama dengan Neraca Saldo, dengan Reset.
- Kolom **pembanding**: periode yang sama setahun sebelumnya (geser 12 bulan, tanggal disesuaikan ke akhir bulan bila perlu, misalnya 29 Feb).
- Format vertikal PSAK, disusun dari grup level-1 di bawah akun induk REVENUE/EXPENSE (berdasarkan kode, sama seperti `isCurrentGroup`):
  1. **Pendapatan Usaha**: grup REVENUE berkode `X-1xxx`
  2. **Beban Pokok Pendapatan**: grup EXPENSE `X-1xxx` → **Laba Kotor**
  3. **Beban Operasional**: grup EXPENSE `X-2xxx` → **Laba Usaha**
  4. **Pendapatan Lain-lain**: grup REVENUE selain `X-1xxx`
  5. **Beban Lain-lain**: grup EXPENSE `X-3xxx` dan seterusnya, **kecuali akun pajak** → **Laba Sebelum Pajak**
  6. **Beban Pajak Penghasilan**: akun EXPENSE yang namanya cocok `/pajak penghasilan/i` → **Laba Bersih**
- Tiap seksi menampilkan akun detail yang nilainya tidak nol, ditambah subtotal. Seksi yang kosong tetap menampilkan judul dengan nilai 0, supaya struktur PSAK utuh.
- Nilai disajikan positif menurut saldo normal. Pengurang seperti retur penjualan (akun REVENUE bersaldo debit) tampil negatif di seksinya.
- Rugi ditampilkan dalam tanda kurung, mengikuti format angka yang dipakai laporan lain.
- **Laba Bersih** periode `[awal tahun buku, as_of]` harus sama dengan baris "Laba (Rugi) Tahun Berjalan" di Posisi Keuangan. Kesamaan ini harus dibuktikan dengan test.
- API `GET /api/reports/income-statement?from&to` → `{ current, comparative }`.

### Aturan bersama Fase 1
- Semua laporan memakai `DateField`, `FilterActions`, dan gaya panel tabel laporan yang sudah ada. Tanpa urut kolom dan tanpa paginasi.
- Header laporan menampilkan nama perusahaan dan periode dalam teks Indonesia, misalnya "1 Januari 2026 – 31 Desember 2026". Ini memudahkan cetak atau tangkapan layar untuk RUPST.
- Bila tahun buku perusahaan tidak dimulai Januari, semua default dan pembanding mengikuti `companies.fiscalYear`.

## Fase 2 — Tutup buku

### Perilaku
- Halaman baru **Pengaturan → Tutup Buku** (`/settings/closing`), peran **admin**.
  - Halaman berisi daftar tahun buku, mulai dari tahun buku jurnal paling awal sampai tahun buku berjalan.
  - Kolom: periode, status (Terbuka/Ditutup), laba bersih tahun itu, tanggal ditutup, dan nama penutup.
- **Tutup Buku** (per tahun buku, hanya untuk tahun yang sudah berakhir):
  - **Syarat:**
    - semua tahun sebelumnya yang punya jurnal sudah ditutup
    - tidak ada transaksi belum dikonfirmasi bertanggal di tahun itu
    - tidak ada upload berstatus `processing` atau `review` yang berisi transaksi di tahun itu
    - tidak ada transaksi terkonfirmasi di tahun itu yang belum dibuatkan jurnal

    Bila ada syarat yang gagal → 409 dengan kode `previous_year_open`, `pending_transactions`, atau `journal_not_generated`. Pesannya Indonesia dan menyebut jumlahnya.
  - **Dialog konfirmasi** menampilkan laba bersih yang akan dipindah dan `SearchSelect` **akun laba ditahan**. Pilihannya akun EQUITY yang aktif dan detail. Default akun bernama "Saldo Laba Ditahan" bila ada.
  - **Dalam satu transaksi:**
    1. Buat jurnal bertipe baru **`CLOSING`** tertanggal hari terakhir tahun buku, dengan keterangan "Jurnal penutup tahun buku 2026". Isinya membalik saldo bersih setiap akun REVENUE/EXPENSE di tahun itu (tanpa jurnal CLOSING), dan selisihnya masuk ke akun laba ditahan. Bila semua saldo nol, tidak ada jurnal yang dibuat, tapi status tetap Ditutup.
    2. Simpan baris `fiscal_closings` berisi `companyId`, `periodStart`, `periodEnd`, `journalId` (nullable), `retainedEarningsAccountId`, `closedBy`, dan `closedAt`, dengan unique (`companyId`, `periodStart`).
- **Buka Kembali** (admin, hanya tahun yang ditutup **paling akhir**): dialog konfirmasi. Jurnal penutup dan baris `fiscal_closings` dihapus dalam satu transaksi.
- **Kunci periode.** Setiap operasi yang menulis jurnal bertanggal di tahun buku yang sudah ditutup ditolak 409 `period_closed` dengan pesan "Tahun buku 2026 sudah ditutup. Buka kembali dulu untuk mengubah." Minimal operasi berikut:
  - generate jurnal dari upload
  - ubah akun jurnal (`PATCH /api/journal/:id/account`)
  - simpan Saldo Awal yang tanggalnya ada di periode tertutup
  - hapus akun yang memindahkan baris jurnal bertanggal di periode tertutup
  - hapus upload yang jurnalnya ada di periode tertutup
  - konfirmasi atau ubah akun transaksi bertanggal di periode tertutup

  Builder wajib mendata semua jalur yang menulis `journal_entries`, `journal_lines`, atau `transactions.account_id`, dan memasang satu helper bersama `assertPeriodOpen(tx, companyId, dates[])`.
- **Laporan dengan jurnal CLOSING:**
  - **Posisi Keuangan** mengabaikan jurnal CLOSING yang tanggalnya `≥` awal tahun buku `as_of`. Dengan begitu, laporan 31 Des 2026 tetap menampilkan "Laba Tahun Berjalan" 2026, sedangkan laba tahun yang sudah ditutup ada di akun laba ditahan. Baris sintetis "Laba (Rugi) Tahun-tahun Lalu" otomatis bernilai nol setelah tahun-tahun itu ditutup.
  - **Laba Rugi** selalu mengabaikan jurnal CLOSING.
  - **Neraca Saldo:**
    - saldo awal selalu memasukkan CLOSING yang bertanggal `< from`
    - mutasi dalam periode **tidak** memasukkan CLOSING secara default
    - ada pilihan "Setelah jurnal penutup" (parameter `closing=1`) untuk memasukkannya
  - **Jurnal Umum dan Buku Besar** menampilkan jurnal CLOSING dengan badge "Penutup". Jurnal ini tidak bisa diedit.
- Dashboard dan perhitungan lain yang memakai laba tidak boleh berubah angkanya hanya karena tahun ditutup. Test harus membuktikan Posisi Keuangan sebelum dan sesudah tutup buku memberi total yang sama.

## Non-goals
- Export Excel/PDF/ZIP paket RUPST, Laporan Perubahan Ekuitas, Arus Kas, dan CALK.
- Tutup buku bulanan. Hanya tahunan.
- Jurnal penyesuaian manual.
- Audit log selain kolom `closedBy`/`closedAt`.

## Anti-goals
- Laporan yang tidak cocok satu sama lain:
  - Laba Bersih di Laba Rugi ≠ Laba Tahun Berjalan di Posisi Keuangan
  - Neraca Saldo tidak seimbang
  - Posisi Keuangan berubah total karena tutup buku
- Jurnal di periode tertutup bisa berubah lewat jalur mana pun.
- Tutup buku setengah jadi. Jurnal penutup, baris closing, dan penguncian berlaku atomik.
- Teks e2e yang sudah ada berubah tanpa test ikut disesuaikan.

## Constraints
- Stack yang ada: SvelteKit + Svelte 5, Drizzle (migrasi baru untuk nilai enum `CLOSING` dan tabel `fiscal_closings`), Zod 4, bits-ui, dan komponen `DateField`/`FilterActions`/`SearchSelect`/`DataTable`/`FormField`. Tidak ada dependensi baru.
- Perhitungan uang memakai helper `D`/`sumMoney`/`toMoney`. Tidak boleh memakai float.
- Pesan Indonesia, error per field memakai kontrak `error.fields`, tema terang/gelap, dan layout 390px.
- Tanggal "hari ini" memakai `todayIso()` (Asia/Jakarta).
- Commit diakhiri trailer atribusi yang berlaku di sesi.
- **Eksekusi:** spec dan plan ditulis dengan Opus. Implementasi per task dikerjakan subagent **Sonnet 5.5**. Review akhir seluruh branch memakai model paling mampu (Opus). Satu plan per fase, dan Fase 1 dikerjakan dan di-merge lebih dulu.

## Keputusan pemilik
- Neraca Saldo dan Posisi Keuangan perlu disesuaikan untuk RUPST dan tutup buku. Kerjakan keduanya (laporan dan tutup buku), mulai dari laporan.
- Spec dan plan ditulis Opus, implementasi dikerjakan Sonnet 5.5.

## Diputuskan Claude
- Posisi Keuangan tetap per tanggal (sesuai PSAK) dan diberi kolom pembanding, bukan rentang tanggal.
- Laba Rugi ditambahkan di Fase 1 karena merupakan laporan periode untuk RUPST, dengan kolom pembanding.
- Pengelompokan Laba Rugi memakai kode grup level-1. Akun pajak dikenali dari nama `/pajak penghasilan/i`.
- Jurnal OPENING selalu dihitung ke saldo awal Neraca Saldo.
- Tutup buku harus berurutan dari tahun terlama, dan buka kembali hanya untuk tahun terakhir yang ditutup.
- Akun laba ditahan dipilih di dialog tutup buku, dengan default "Saldo Laba Ditahan".
- Neraca Saldo default "sebelum jurnal penutup", dengan pilihan "setelah jurnal penutup".
- **Jurnal OPENING dan tahun buku:**
  - Daftar tahun di Tutup Buku dan syarat `previous_year_open` dihitung dari jurnal **non-OPENING** paling awal. Tahun yang hanya berisi Saldo Awal tidak perlu ditutup.
  - Begitu ada satu tahun yang ditutup, Saldo Awal tidak bisa diubah lagi (409 `period_closed`), karena Saldo Awal menjadi dasar semua tahun sesudahnya.
- **Baris pendapatan/beban di jurnal OPENING:**
  - Baris ini dihitung sebagai laba di tahun buku tempat tanggal OPENING berada, konsisten dengan perhitungan Posisi Keuangan (dan dashboard) sekarang.
  - Laba Rugi memasukkannya bila tanggal OPENING ada dalam `[from, to]`, dan jurnal penutup ikut membaliknya.
  - Di Neraca Saldo baris ini tetap masuk kolom saldo awal.
- Upload yang transaksinya melewati tahun tertutup ditolak seluruhnya saat generate.
- Upload berstatus `processing`/`review` dihitung ke syarat `pending_transactions`.
- (Saat menulis plan Fase 2) **Tanggal terkunci** = tanggal `≤` akhir tahun buku terakhir yang ditutup. Aturan ini juga mengunci upload yang melewati tahun tertutup: upload ditolak seluruhnya saat disimpan, bukan baru saat generate.
- (Saat menulis plan Fase 2) Format jurnal penutup: refNo `TUTUP-2026`, label tahun buku non-Januari `2025/2026`.
- (Saat menulis plan Fase 2) API ada di `/api/closings` (GET daftar, POST tutup, DELETE `/:periodStart` buka kembali).

## Ditinggalkan untuk builder
- Bentuk persis query (satu query dengan `CASE` atau beberapa query) dan pembagian file service laporan.
- Tata letak detail halaman Tutup Buku dan teks deskripsi kecil, selama mengikuti gaya halaman Pengaturan yang ada.

## Definisi selesai
- **Unit/integrasi:**
  - rumus saldo awal/mutasi/akhir, termasuk jurnal OPENING di tanggal `from`
  - pembanding Posisi Keuangan
  - struktur dan subtotal Laba Rugi
  - kesamaan Laba Bersih dengan Laba Tahun Berjalan
  - tahun buku non-Januari
  - (Fase 2) jurnal penutup benar
  - (Fase 2) syarat dan urutan tutup buku
  - (Fase 2) buka kembali
  - (Fase 2) setiap jalur tulis ditolak di periode tertutup
  - (Fase 2) Posisi Keuangan sama sebelum dan sesudah tutup buku
- **E2E:**
  - Neraca Saldo rentang tanggal dan Reset
  - Posisi Keuangan menampilkan dua kolom
  - Laba Rugi tampil dan seimbang
  - (Fase 2) tutup buku lalu buka kembali, dengan perusahaan khusus test agar tidak mengganggu test paralel
- `bun run test`, `bun run check`, `bun run build`, dan seluruh e2e lulus.
