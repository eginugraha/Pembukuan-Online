# Brand "Pena", Breadcrumb, Chart Dashboard, Favicon, dan Halaman Error — Desain

Tanggal: 2026-10-18 · Status: disetujui di chat ("sudah cukup, jalankan")

## Intent
Pemilik meminta lima perubahan:
1. breadcrumb
2. chart dashboard (rekomendasi)
3. rebrand menjadi **pena**
4. favicon
5. halaman 404 dan 500

Spec dan plan ditulis dengan Opus, implementasi dikerjakan dengan Sonnet 5.5.

## 1. Brand "pena"
- **Nama dan tagline:** "pena" berasal dari **Pe**mbukuan **N**i**a**ga. Taglinenya **"Pembukuan Keuangan Online Gratis"**.
- **Logo:** tile hijau berisi huruf **"P"** saja, menggantikan "J".
  - Wordmark di samping logo (sidebar lebar dan halaman login): `pena.` dengan huruf kecil dan titik aksen, mengikuti gaya "Jurnalku." sekarang.
  - Saat sidebar diciutkan, hanya tile "P" yang tampil.
- **Teks yang terlihat:** semua kemunculan "Jurnalku" di UI diganti:
  - judul dokumen
  - `aria-label` link logo: "pena"
  - footer: `© 2026 pena`
  - dialog logout: "Keluar dari pena?"
  - deskripsi Saldo Awal
- **Judul tab:** `{Judul halaman} · pena`. Halaman login: `Masuk · pena — Pembukuan Keuangan Online Gratis`.
  - Judul diatur terpusat lewat `PageHeader` (`<svelte:head>`), supaya semua halaman konsisten.
  - Halaman yang sudah punya `<svelte:head>` sendiri (dashboard, profil) diseragamkan ke format ini.
- **Tagline** tampil di halaman login (di bawah wordmark), di `<meta name="description">`, dan sebagai `title` pada link logo.
- **Tidak berubah:** identitas teknis seperti nama repo/paket, key `localStorage` (`jk-theme`, `jk-sidebar`), nama cookie, email seed `admin@jurnalku.local`, dan nama database. Kalau diubah, sesi dan preferensi pengguna yang ada akan hilang.

## 2. Favicon
- `app/static/favicon.svg`: tile hijau membulat dengan "P" putih tebal, memakai warna hijau brand yang ada.
- Tambahan PNG: `favicon-32.png` dan `apple-touch-icon.png` (180×180), dihasilkan dari SVG yang sama.
- `app.html` memasang `<link rel="icon" type="image/svg+xml">`, `<link rel="icon" sizes="32x32">`, `<link rel="apple-touch-icon">`, dan `<meta name="theme-color">`.
- Tanpa dependensi baru. PNG boleh dibuat sekali dengan skrip memakai Playwright yang sudah ada di devDependencies, lalu di-commit.

## 3. Breadcrumb
- **Posisi:** di atas judul halaman, dirender oleh `PageHeader`. Tidak ditampilkan di Dashboard.
- **Isi:** dibentuk otomatis dari `NAV` (`src/lib/nav.ts`) berdasarkan path aktif.
  - Urutannya: `Dashboard` (link) → label grup bila ada (teks, bukan link, karena grup bukan halaman) → item menu.
  - Contoh: `Dashboard / Laporan Keuangan / Laba Rugi`, `Dashboard / Pengaturan / Tutup Buku`, `Dashboard / Review & Konfirmasi`.
- **Halaman detail:** `PageHeader` menerima prop opsional `crumb` untuk menambah satu level terakhir. Item menu induknya menjadi link.
  - Contoh: `/uploads/[id]` → `Dashboard / eStatement / Riwayat Upload / {nama file atau periode}`.
  - `/uploads/new` sudah ada di NAV ("Upload Baru").
  - Profil → `Dashboard / Profil Saya`.
- **Aksesibilitas:** `<nav aria-label="Breadcrumb"><ol>`. Item terakhir memakai `aria-current="page"` dan tidak berupa link. Pemisahnya ikon chevron yang `aria-hidden`.
- **HP:** satu baris. Item tengah boleh dipotong dengan elipsis, dan halaman tidak boleh ikut scroll horizontal.

## 4. Chart dashboard
Disetujui di chat. Tiga chart menggantikan tiga bar kecil berbasis arus bank yang ada sekarang. Bar "laba" yang lama dihitung dari arus bank, padahal itu bukan laba.

1. **Laba Rugi bulanan (utama, lebar penuh)**
   - Batang Pendapatan dan Beban per bulan untuk 12 bulan tahun buku yang memuat hari ini, ditambah garis Laba Bersih.
   - **Sumber angka sama dengan laporan Laba Rugi:**
     - akun REVENUE/EXPENSE detail
     - semua jurnal kecuali CLOSING (OPENING ikut)
     - pendapatan = kredit − debit, beban = debit − kredit
   - Laba bersih per bulan harus sama dengan `getIncomeStatement` untuk bulan itu. Ini dibuktikan dengan test.
   - Bulan setelah bulan berjalan ditampilkan kosong (tanpa batang), dengan label tetap ada.
   - Klik atau Enter pada satu bulan membuka `/income-statement?from={awal bulan}&to={akhir bulan}`.
   - Saat hover atau fokus, tooltip menampilkan Pendapatan, Beban, dan Laba dalam format rupiah. Rugi ditampilkan dalam kurung dan berwarna destruktif.
2. **Donut komposisi kategori**
   - Toggle **Beban | Pendapatan**, default Beban.
   - Datanya akun detail dalam tahun buku berjalan sampai hari ini, dengan aturan sumber yang sama.
   - Hanya akun bernilai positif yang ditampilkan. Lima akun terbesar tampil sebagai irisan, sisanya digabung menjadi **"Lainnya"**.
   - Bagian tengah donut menampilkan total irisan beserta labelnya ("Total beban" / "Total pendapatan").
   - Legenda menampilkan nama akun, nominal, dan persen.
   - Bila kosong, tampilkan "Belum ada beban di tahun buku ini" (atau "pendapatan").
3. **Tren saldo bank (garis kecil)**
   - Saldo akhir akun bank perusahaan pada akhir tiap bulan untuk 12 bulan terakhir (bulan berjalan = saldo sampai hari ini).
   - Bila akun bank belum diatur, kartu ini tidak tampil.

**Tetap dipertahankan:** kartu Saldo Bank, Review, Upload terakhir, Laba tahun berjalan (angka besar), daftar Aksi, dan Transaksi terbaru.

**Bila belum ada jurnal sama sekali**, chart menampilkan keadaan kosong "Belum ada jurnal di tahun buku ini", dan dashboard tidak error.

**Teknis:**
- Chart dibuat sendiri dengan SVG di `src/lib/components/charts/`, tanpa library baru.
- Warna mengikuti token tema terang/gelap: pendapatan memakai hijau brand, beban memakai warna destruktif/oranye, garis laba memakai warna ink.
- Palet donut terdiri dari lima tingkat hijau/teal ditambah abu-abu untuk "Lainnya".
- Responsif: di HP chart Laba Rugi tetap terbaca, label bulan disingkat, dan tidak ada scroll horizontal di halaman.
- **Aksesibilitas:**
  - setiap chart punya `role="img"` dengan `aria-label` ringkasan
  - batang bulan dapat difokus dengan keyboard
  - ada tabel `sr-only` berisi angka yang sama

## 5. Halaman 404 dan 500
- **`src/routes/+error.svelte` (root):** dipakai untuk route yang tidak ada dan error di luar aplikasi utama. Halaman berdiri sendiri bergaya brand (logo "P", wordmark pena).
  - **404:** judul **"Halaman tidak ditemukan"**, teks "Halaman yang Anda cari tidak ada atau sudah dipindahkan.", tombol **"Kembali ke Dashboard"** (ke `/dashboard`, yang akan mengarahkan ke login bila belum masuk).
  - **500 dan 5xx lain:** judul **"Terjadi kesalahan"**, teks "Maaf, ada masalah di server. Coba lagi beberapa saat lagi.", tombol **"Muat ulang"** dan **"Kembali ke Dashboard"**. Pesan error mentah tidak ditampilkan.
  - **Status lain (400, 403, …):** judul sesuai status ("Akses ditolak" untuk 403, "Permintaan tidak valid" untuk 400), teks memakai `page.error.message` (pesan Indonesia dari `ApiError`), tombol kembali.
  - Kode status tampil besar sebagai elemen dekoratif.
- **`src/routes/(app)/+error.svelte`:** isi yang sama, tetapi dirender **di dalam shell aplikasi** (sidebar dan header tetap ada) untuk error dari halaman aplikasi, misalnya `notFound` dari `withPageErrors` atau 403 peran.
- **`src/error.html`:** halaman statis paling dasar, untuk kegagalan saat SvelteKit sendiri tidak bisa merender. Bergaya inline, bertuliskan "pena", "Terjadi kesalahan", dan link ke `/`.
- **`handleError` di `hooks.server.ts`:** mencatat error tak terduga ke `console.error` dan mengembalikan `{ message: 'Terjadi kesalahan di server' }`, supaya detail tidak bocor.
- **Judul tab:** `404 · pena` / `Terjadi kesalahan · pena`.

## Non-goals
- Domain, SEO, dan halaman marketing.
- Export laporan.
- Chart di halaman laporan.
- Mengganti nama teknis (repo, DB, cookie, localStorage).

## Anti-goals
- Angka chart Laba Rugi berbeda dari laporan Laba Rugi.
- Breadcrumb yang salah tingkat atau patah di HP.
- Halaman error yang membocorkan stack trace atau pesan teknis.
- Sisa teks "Jurnalku" yang terlihat oleh pengguna.

## Constraints
- Stack yang ada: SvelteKit + Svelte 5 runes, Tailwind v4, bits-ui, Bun, Drizzle. Tanpa dependensi baru.
- Uang memakai `D`/`sumMoney`/`toMoney`/`formatAccounting`. "Hari ini" memakai `todayIso()`.
- UI dalam Bahasa Indonesia, mendukung tema terang/gelap, layout 390px.
- Teks e2e yang memakai "Jurnalku" harus ikut diperbarui.

## Diputuskan Claude
- **Penulisan brand:** wordmark dan logo memakai huruf kecil "pena" (seperti yang ditulis pemilik). Teks dan judul juga memakai "pena".
- **Judul tab** diatur terpusat lewat `PageHeader`.
- **Breadcrumb** ditempatkan di atas judul, bukan di header.
- **Chart:**
  - Chart Laba Rugi mencakup 12 bulan tahun buku berjalan, sedangkan tren bank mencakup 12 bulan terakhir.
  - Donut hanya memakai akun bernilai positif, dengan lima irisan teratas ditambah "Lainnya".
  - Chart dibuat dengan SVG buatan sendiri.
- **Halaman error:** ada dua `+error.svelte` (root dan di dalam shell), ditambah `error.html` dan `handleError`.
