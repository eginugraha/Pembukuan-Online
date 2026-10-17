# Sidebar Ciut, Tombol Perusahaan, Date Picker, Tabel ala DataTable, dan Reset Filter — Desain

Tanggal: 2026-10-17 · Status: menunggu persetujuan

## Intent

Pemilik meminta enam perbaikan UI:
1. Hapus profil dan tombol Keluar dari sidebar.
2. Sidebar bisa dilebarkan dan diciutkan.
3. Rapikan tombol "+ Perusahaan baru".
4. Date picker bergaya sama dengan dropdown baru.
5. Tabel bergaya DataTable.
6. Tombol Reset di setiap filter.

Usulan dan mockup (`.superpowers/brainstorm/93401-1792230590/content/table-datepicker-sidebar.html`) disetujui dengan jawaban "lanjut".

## Goals

1. **Sidebar tanpa profil dan Keluar.** Keduanya tetap tersedia di menu avatar (top bar).
2. **Sidebar desktop bisa diciutkan dan dilebarkan.**
   - Mode ciut: lebar ±64px, hanya ikon, dan nama menu muncul sebagai tooltip saat hover/fokus.
   - Logo menjadi tile "J" saja.
   - Label grup dan kartu "Langkah berikutnya" disembunyikan.
   - Tombol « / » ada di bagian bawah sidebar.
   - Pilihan diingat per browser.
   - Indikator menu aktif tetap berfungsi di kedua mode.
3. **Tombol "+ Perusahaan baru"** menjadi tombol outline, tingginya sama dengan dropdown perusahaan (h-10). Di bawah `sm` hanya ikon, dengan `aria-label` tetap "Perusahaan baru".
4. **`DateField` (bits-ui DatePicker):**
   - Gaya trigger sama dengan dropdown (h-10, rounded-xl, bg-field, fokus hijau, `aria-invalid` merah).
   - Tanggal bisa diketik per segmen (hari/bulan/tahun) atau dipilih lewat kalender popup.
   - Kalender memakai locale `id-ID`, minggu dimulai Senin, dan punya pintasan "Hari ini" dan "Hapus".
   - Nilai keluar dan masuk sebagai string `YYYY-MM-DD`. Ada opsi `name` untuk input hidden agar form GET tetap berfungsi.
   - Menggantikan semua `<input type="date">`: filter Jurnal (Dari/Sampai), Buku Besar (Dari/Sampai), Neraca Saldo (Per tanggal), Posisi Keuangan (Per tanggal), dan Saldo Awal (Tanggal mulai, termasuk validasi FormState).
5. **`DataTable` (komponen sendiri, client-side, tanpa dependensi baru)** untuk tabel daftar:
   - Riwayat Upload, transaksi di detail upload, Category Rules, Pengguna & Role, dan Chart of Accounts.
   - Fitur:
     - kotak cari (mencocokkan kolom yang ditandai bisa dicari)
     - jumlah baris
     - urut per kolom (klik header: naik → turun → asal), dengan `aria-sort`
     - paginasi 10/25/50 per halaman, dengan nomor halaman dan Prev/Next
     - teks "1–10 dari N"
     - keadaan kosong, termasuk "Tidak ada data yang cocok" saat dicari
   - Mencari atau mengubah ukuran halaman akan kembali ke halaman 1.
   - Gaya: toolbar di atas, header tabel ber-latar `muted`, hover baris, dan paginasi di bawah, semuanya dalam satu panel.
   - **Chart of Accounts:** tetap mengikuti urutan pohon (indentasi). Bisa dicari dan dipaginasi, tapi kolomnya tidak bisa diurutkan.
6. **Tabel laporan** (Jurnal Umum, Buku Besar, Neraca Saldo, Posisi Keuangan, Saldo Awal) hanya mengikuti **gaya visual** DataTable (panel, header, hover), **tanpa** urut kolom atau paginasi, karena urutan dan saldo berjalan bermakna akuntansi.
7. **Tombol "↺ Reset"** di samping "Tampilkan" pada filter Jurnal, Buku Besar, Neraca Saldo, dan Posisi Keuangan. Reset adalah link ke path tanpa query, sehingga server memakai default yang sudah ada (bulan berjalan atau akhir bulan berjalan; Buku Besar tanpa akun terpilih). Tombol hanya aktif kalau ada query filter.

## Non-goals

- Paginasi atau pencarian di server. Data per perusahaan kecil.
- Sidebar ciut di HP, karena di HP tetap memakai menu geser.
- Rentang tanggal dalam satu kalender (range picker). Dari/Sampai tetap dua field.

## Anti-goals

- Fitur yang hilang atau berubah perilaku: aksi di dalam tabel (ganti role, nonaktifkan akun, hapus rule, ubah saldo normal/arus kas) harus tetap berfungsi di halaman mana pun.
- Teks yang dipakai e2e berubah. `Generate Jurnal`, `Perlu review`, badge `Balance` (exact), `Konfirmasi semua saran…`, dan seterusnya tetap.
- Tabel laporan yang urutannya bisa dikacaukan pengguna.
- Kontrol tanpa fungsi, atau tooltip yang tidak bisa diakses keyboard.

## Constraints

- **Stack:** Svelte 5, bits-ui 2.19.5 (`DatePicker`, `Calendar`, `Tooltip`, `Pagination` tersedia), `@internationalized/date` 3.12.4 (sudah terpasang), dan token tema terang/gelap yang ada.
- **Sidebar desktop** saat ini `fixed` dengan lebar `w-64`, dan konten memakai `lg:pl-64`. Mode ciut mengubah keduanya, misalnya `w-16`/`lg:pl-16`, dengan transisi lebar ±200ms yang dimatikan saat reduce-motion. Pastikan test `fixed-chrome` dan `sidebar-flicker` tetap lulus.
- **Kunci localStorage** tidak boleh bertabrakan dengan `jk-theme`. Gunakan `jk-sidebar` = `expanded|collapsed`.
- **Kedipan saat load:** status ciut dibaca sebelum render pertama lewat skrip inline di `app.html`, dengan menambah atribut `data-sidebar="collapsed"` pada `<html>`. Ini supaya tidak ada lompatan lebar saat halaman dimuat, mengikuti pola anti-kedip tema.

## Keputusan pemilik

- Keenam poin dan usulan di chat, termasuk bagian yang bertanda *tebakan*: hanya desktop, kartu disembunyikan saat ciut, CoA tanpa urut kolom, dan tabel laporan hanya gaya visual.

## Diputuskan Claude

- **Komponen `DataTable` generik** dengan definisi kolom `{ key, label, sortable?, searchable?, align?, sortValue?(row) }` dan snippet `cell(row, column)`. Snippet dipakai untuk sel berisi aksi (dropdown, tombol, badge).
- **Pencarian** tidak membedakan huruf besar/kecil dan memakai substring atas `String(row[key])` untuk kolom `searchable`.
- **Pengurutan** angka/tanggal memakai `sortValue`, sedangkan teks memakai `localeCompare('id')`.
- **Ukuran halaman default 10.** Pilihan ukuran halaman memakai `SimpleSelect`.
- **Tooltip** memakai bits-ui `Tooltip`. Item menu tetap berupa `<a>` dengan `aria-label` saat ciut.
- **`DateField`** memakai `parseDate`/`toString()` dari `@internationalized/date`, dan label tanggal yang terlihat berformat `dd MMM yyyy` id-ID.

## Definisi selesai

- **Test e2e:**
  - sidebar ciut/lebar, diingat setelah reload, tooltip muncul, dan tidak ada profil/Keluar di sidebar
  - date picker: ketik tanggal, pilih dari kalender, lalu filter bekerja
  - DataTable di Riwayat Upload atau Rules: cari, urut, dan paginasi
  - Reset mengembalikan URL tanpa query
- `bun run test`, `bun run check`, `bun run build`, dan seluruh e2e lulus.
- Cek visual kedua tema, desktop dan 390px.
