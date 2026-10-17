# Ubah Akun Jurnal, Hapus Akun, Polesan UI, dan Perbaikan Temuan Minor — Desain

Tanggal: 2026-10-18 · Status: usulan di chat disetujui ("ya lanjut, semua minor ikut dikerjakan")

## Intent

Pemilik meminta tujuh perubahan, ditambah perbaikan semua temuan minor dari tiga review terakhir:

1. Baris Total pada tabel tidak lagi kotak.
2. Tombol ciutkan sidebar pindah ke kiri pemilih perusahaan, berupa panah saja.
3. Tombol profil ("Halo, …") di navbar diberi padding kiri.
4. Akun di Jurnal Umum bisa diubah untuk perbaikan.
5. Akun di Chart of Accounts bisa dihapus, dengan pengecekan dan pemindahan data, dan popup konfirmasi.
6. Pemilih tema menjadi dropdown.
7. Popup konfirmasi saat logout.

## Goals dan perilaku

### Poin 1–3, 6, 7 (UI)
- **Total:** `.rounded` pada baris total tabel (laporan dan Jurnal): sel pertama dan terakhir membulat sesuai panel. Sudut bawah panel juga harus membulat.
- **Toggle sidebar:** tombol ikon panah (`ChevronsLeft`/`ChevronsRight`) di top bar, **sebelum** pemilih perusahaan, hanya tampil di desktop (`lg+`). Di sidebar tidak ada lagi tombol ciutkan. Di HP posisi pertama tetap tombol menu. Tombol punya `aria-label` "Ciutkan sidebar"/"Lebarkan sidebar", `aria-expanded`, dan `aria-controls="app-sidebar"`.
- **Profil:** tombol "Halo, …" mendapat `pl-3` (dan padding konsisten dengan tombol outline lain).
- **Tema:** `ThemeSelect` — dropdown (SimpleSelect) dengan ikon + label (Terang · Gelap · Sistem), `aria-label="Tema"`. Di HP cukup ikon pada trigger.
- **Logout:** menu profil → "Keluar" membuka dialog "Keluar dari Jurnalku?" berisi tombol Batal dan Keluar. Hanya tombol Keluar yang mengirim form POST ke `/logout`.

### Poin 4 — ubah akun di Jurnal Umum
- Hanya jurnal bertipe `TRANSACTION`. **Akun kategori** (lawan akun bank) yang bisa diubah; baris bank, tanggal, dan nominal terkunci. Jurnal `OPENING` diubah lewat Saldo Awal.
- API `PATCH /api/journal/:id/account` dengan body `{ accountId }`. Peran minimum: **accountant**.
- Server: dalam satu transaksi, kunci baris perusahaan, cek akun baru dengan `assertCategoryAccount` (aktif, detail, bukan akun bank), lalu perbarui baris jurnal kategori dan `transactions.account_id` (`source = 'USER'`, `confirmedBy`, `confirmedAt`). Baris kategori diidentifikasi sebagai baris jurnal yang `account_id`-nya sama dengan `transactions.account_id` (bukan dengan membandingkan ke akun bank saat ini, agar tetap benar bila akun bank pernah diganti).
- Error per field `accountId`. Entry milik perusahaan lain atau tidak ada → 404. Entry OPENING → 409 `journal_not_editable`.
- UI: ikon pensil pada baris kategori jurnal TRANSACTION (hanya bila peran ≥ accountant), membuka dialog dengan `SearchSelect` akun, tombol Simpan, dan pesan error di bawah field.

### Poin 5 — hapus akun
- API:
  - `GET /api/accounts/:id/usage` → `{ journalLines, transactions, rules, children, isBankAccount }`
  - `POST /api/accounts/:id/delete` body `{ moveToId?: string }`. Peran: **admin**. Endpoint `DELETE /api/accounts/:id` (nonaktifkan) tidak berubah.
- Aturan:
  - Ditolak 409 bila akun masih punya anak (`has_children`), atau akun bank perusahaan (`bank_account`).
  - Akun belum dipakai → dihapus langsung.
  - Akun dipakai (baris jurnal, transaksi — `account_id` maupun `ai_suggested_account_id` — atau rule) → wajib `moveToId`, kalau tidak 409 `move_required` (field `moveToId`).
  - Akun tujuan: aktif, detail (leaf), bukan akun itu sendiri, **tipe sama dan saldo normal sama**, bukan akun bank; bila tidak memenuhi → 422 `invalid_move_target` (field `moveToId`).
  - Pemindahan semua referensi (`journal_lines`, `transactions.account_id` + `ai_suggested_account_id`, `category_rules`) dan penghapusan akun berlangsung dalam **satu transaksi**: gagal sebagian = tidak ada yang berubah.
- UI: tombol "Hapus" di tabel Chart of Accounts membuka dialog konfirmasi. Dialog memuat penggunaan akun. Bila belum dipakai: teks konfirmasi sederhana. Bila dipakai: ringkasan jumlah data dan `SearchSelect` akun tujuan yang sudah disaring (aturan di atas), wajib dipilih. Tombol "Hapus akun" bergaya destruktif. Error server tampil di dialog.

### Temuan minor (semua)
Dari review dashboard:
- **Pending count** hanya menghitung transaksi dari upload yang tidak berstatus `processing`.
- **Grafik laba:** bulan rugi berwarna destruktif (tidak lagi memakai nilai absolut tanpa tanda).
- **Keterangan tahun buku** memakai awal tahun buku perusahaan yang sebenarnya, bukan tahun kalender.
- **Dua query ganda** di dashboard (layout dan halaman) dihapus: layout menghitung sekali, dashboard memakai hasilnya.
- **Laba tahun berjalan** diambil dari field eksplisit `getBalanceSheet().profit`, bukan dengan mencocokkan nama baris.
- **Zona waktu:** `todayIso()` memakai `Asia/Jakarta` (bukan zona server).
- **Dropzone** upload punya cincin fokus saat dipakai keyboard.

Dari review tema/validasi:
- Skrip tema di `app.html` memperlakukan nilai tersimpan yang tidak dikenal sebagai `dark`, sama dengan `theme.ts`.
- `password_required` dikaitkan ke field `name` bila nama yang kosong.
- `FormState.handleServerError` mengembalikan pesan umum bila ada key error yang bukan field form.
- Error field login tanpa JavaScript punya `aria-invalid`/`aria-describedby`.
- Memilih ulang file upload yang sama setelah ditolak memicu pengecekan ulang.
- Latar `Input` di tema gelap sama dengan dropdown (`bg-field` tidak tertimpa `dark:bg-input/30`).
- (Radiogroup tema dan tampilan awal toggle tema tidak berlaku lagi karena tema menjadi dropdown; tampilan awal dropdown mengikuti `data-theme` di `<html>` sehingga tidak berkedip.)

Dari review tabel/date picker/sidebar:
- Tanggal yang diketik setengah (tanpa tahun) menampilkan pesan "Lengkapi tanggal" dan **memblokir submit** form filter.
- Pindah dari segmen tanggal (Tab) memicu validasi field (`onblur`/`focusout` grup).
- Klik label `FormField` pada `DateField` memfokuskan segmen pertama.
- Item menu sidebar saat ciut tidak dibaca dua kali (tooltip tidak memasang `aria-describedby`).
- Ikon toggle sidebar benar sejak render pertama (ikon ditentukan CSS berdasarkan `data-sidebar`).
- Elipsis paginasi `aria-hidden`; kode akun tidak patah baris (`whitespace-nowrap`); pencarian di detail upload mencakup kode akun saran.
- Tombol Reset hanya aktif bila nilai filter berbeda dari default (bukan sekadar ada query string).

## Non-goals
- Riwayat perubahan (audit log) untuk edit jurnal dan hapus akun.
- Mengubah tanggal atau nominal jurnal, atau menghapus jurnal.
- Memindahkan akun anak saat menghapus induk (induk harus tanpa anak).

## Anti-goals
- Data akuntansi tidak konsisten setelah edit/hapus: jurnal selalu seimbang, `transactions.account_id` selalu sama dengan baris kategori jurnalnya, dan tidak ada referensi menggantung.
- Penghapusan sebagian: pemindahan dan penghapusan wajib atomik.
- Menghapus akun bank perusahaan, atau memindahkan data ke akun berbeda tipe/saldo normal.
- Teks e2e yang sudah ada berubah tanpa test ikut disesuaikan.

## Constraints
- Svelte 5, bits-ui `Dialog`/`Select`, komponen `SearchSelect`/`SimpleSelect`/`FormField` yang ada, token tema terang/gelap.
- Pesan Indonesia. Error API per field memakai kontrak `error.fields`.
- Tidak ada dependensi baru.
- Setiap commit diakhiri `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Diputuskan Claude
- Tombol "Hapus" ditambahkan di samping "Nonaktifkan" (nonaktifkan tetap ada).
- Pemindahan wajib tipe dan saldo normal yang sama agar laporan tidak terbalik.
- Peran edit jurnal = accountant, hapus akun = admin (mengikuti kebijakan yang ada: jurnal dibuat oleh accountant, akun dikelola admin).
- Zona waktu "hari ini" tetap `Asia/Jakarta` (pengguna dan bank di Indonesia).
