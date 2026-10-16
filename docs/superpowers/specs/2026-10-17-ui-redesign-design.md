# Redesign UI Jurnalku — "Modern 3D Dashboard"

Tanggal: 2026-10-17 · Status: menunggu persetujuan

## Intent

Tampilan Jurnalku sekarang masih berupa shadcn polos (abu-abu/slate, link biru). Pemilik ingin aplikasi terasa
modern, bersih, dan "kekinian" seperti dashboard di Dribbble, dengan elemen bergaya 3D.

Referensi (disediakan pemilik, ada di root repo):

- **`1.webp` (Super Finti, fintech dashboard): sumber STRUKTUR.**
  - Sidebar putih dengan menu yang dikelompokkan dan chevron, plus kartu "Help Center" di bagian bawah.
  - Top bar ringan.
  - Tiga kartu utama bergradien dengan objek 3D kecil.
  - Satu baris statistik dengan mini bar chart yang batang aktifnya "bercahaya" (glow).
  - Daftar transaksi terbaru yang dikelompokkan per tanggal, dan daftar di sisi kanan dengan ikon kotak berwarna.
- **`2.webp` (Planti, marketplace dashboard): sumber WARNA.** Lime, hijau tua untuk judul, menu aktif hijau pucat
  dengan garis hijau di kiri, dan kanvas abu.

Mockup yang sudah disetujui: `.superpowers/brainstorm/*/content/dashboard-v2.html`. Pemilik bilang "sudah sesuai,
terapkan ke seluruh aplikasi".

## Goals

1. Gaya baru diterapkan ke **seluruh aplikasi**: shell (sidebar + top bar), login, dashboard, dan semua halaman di
   `src/routes/(app)/**` (upload, review, jurnal, buku besar, neraca saldo, posisi keuangan, semua pengaturan),
   termasuk dialog, form, tabel, badge, alert, dan tombol.
2. Dashboard dirombak mengikuti struktur mockup, dengan **data sungguhan**.
3. "3D" diwujudkan sebagai ikon/objek bergaya 3D: gradien, highlight, bayangan berwarna, dan glow.
4. Halaman angka (laporan, jurnal, buku besar, review) tetap mudah dibaca: tabel rapi, angka `tabular-nums` rata kanan.

## Non-goals

- Dark mode. Token `.dark` dibiarkan apa adanya, tidak ada toggle.
- Model 3D sungguhan (three.js, gambar render) atau aset gambar eksternal.
- Mengubah alur, fitur, izin (RBAC), atau API. Ini murni tampilan, kecuali data tambahan untuk dashboard.
- Elemen dekoratif yang tidak berfungsi.

## Anti-goals (dianggap gagal walaupun "jalan")

- **Kontrol palsu.** Kotak pencarian, lonceng notifikasi, atau tombol yang tidak melakukan apa-apa. Di referensi ada
  search, ikon, dan link "Wallet/Invoice". Di Jurnalku, setiap kontrol di top bar harus berfungsi atau tidak ditampilkan.
- **Keterbacaan turun.** Laporan yang lebih susah dibaca demi estetika, misalnya teks abu-abu kontras rendah di atas
  lime atau angka di atas gradien ramai.
- **Fitur hilang atau rusak**, test e2e/integrasi gagal, atau layout pecah di layar HP.

## Constraints

- Stack yang sudah ada: SvelteKit + Svelte 5 runes, Tailwind v4, shadcn-svelte (komponen di `src/lib/components/ui`),
  ikon `@lucide/svelte` (sudah terpasang).
- Theming lewat CSS variable shadcn di `src/app.css` (`--primary`, `--accent`, `--radius`, dll.). Utamakan mengganti
  token dan varian komponen daripada menambal kelas per halaman.
- Masih ada warna hardcoded di halaman (`text-slate-500` ×14, `text-blue-600` ×6, `bg-slate-50`, `text-red-600`,
  `border-blue-500`, dll.). Semuanya diganti dengan token atau kelas tema.
- Bahasa UI tetap Bahasa Indonesia.
- Responsif: di bawah `lg` sidebar menjadi drawer dengan tombol menu di top bar. Tidak boleh ada scroll horizontal di
  level halaman; tabel lebar boleh scroll di dalam panelnya sendiri.
- Aturan cursor pointer di `app.css` (commit 08b548e) tetap berlaku.

## Keputusan yang sudah diambil pemilik

- Struktur dari `1.webp`, warna dari `2.webp`. Mockup v2 disetujui apa adanya.
- Berlaku untuk seluruh aplikasi.

## Palet (diambil langsung dari piksel `2.webp`)

| Token | Hex | Pemakaian |
|---|---|---|
| canvas | `#DEE1E7` | latar di luar "app frame" |
| lime | `#C0F497` | kartu sorotan, kartu bantuan, highlight |
| lime-2 | `#A8E57C` | ujung gradien lime, bar aktif |
| green | `#6BAD40` | logo, aksen, angka positif, indikator menu aktif |
| deep | `#3E6E1C` | judul seksi, teks menu aktif, tombol primer |
| pale | `#F2FFEF` | latar menu aktif, latar chip |
| ink | `#14210F` | teks utama |
| hero-dark | `#0D2615` → `#1F4D2B` | permukaan gelap bila perlu kontras (opsional) |

Merah untuk nilai negatif dan error tetap memakai `--destructive`. Kuning/amber dipakai untuk status peringatan.

## Struktur yang harus diwujudkan

**Shell (`src/routes/(app)/+layout.svelte`)**
- Kanvas `#DEE1E7`. Di desktop, aplikasi tampil sebagai frame putih membulat besar (±24px) dengan bayangan lembut,
  seperti di referensi.
- **Sidebar:**
  - Logo "Jurnalku." dengan tile 3D hijau.
  - Grup menu dari `src/lib/nav.ts` dengan label grup.
  - Item menu: ikon lucide di dalam tile kecil, label, dan chevron.
  - Item aktif: latar `pale`, teks `deep`, dan garis `green` di tepi kiri.
  - Kartu lime di bawah dengan lingkaran ikon yang menonjol, menggantikan "Help Center" di referensi. Jurnalku belum
    punya halaman bantuan, jadi kartu ini menjadi **"Langkah berikutnya"** yang kontekstual. Isinya, sesuai urutan:
    saldo awal belum diisi → "Atur Saldo Awal"; ada transaksi menunggu → "Review N transaksi"; selain itu → "Upload
    eStatement". Item disaring sesuai role; viewer tidak melihat aksi yang tidak boleh ia lakukan, dan kalau tidak ada
    aksi yang relevan kartunya disembunyikan. *(Keputusan Claude.)*
  - Blok user di bawah: nama, role, tombol Keluar.
- **Top bar:**
  - Pemilih perusahaan (fungsi yang sudah ada).
  - Link "+ Perusahaan baru" untuk super admin.
  - Sapaan "Halo, {nama}" dengan avatar inisial bergaya 3D.
  - Di layar kecil: tombol hamburger.
  - Tidak ada search atau notifikasi palsu.

**Dashboard (`src/routes/(app)/dashboard`)**, sesuai mockup v2:
1. Tiga kartu utama:
   - **Saldo Bank** (akun bank perusahaan per hari ini), dengan link ke Buku Besar akun bank.
   - **Status Review**: jumlah transaksi menunggu konfirmasi dan objek 3D, dengan link ke Review.
   - **Kartu rekening** bergaya kartu bank lime: nomor rekening dari upload terakhir, nama perusahaan, dan periode
     upload terakhir. Kalau belum ada upload, kartu mengajak upload pertama.
2. Baris statistik dengan mini bar chart 6 bulan terakhir, bulan berjalan disorot dan bercahaya:
   - **Pemasukan**: total kredit transaksi bank per bulan.
   - **Pengeluaran**: total debit per bulan.
   - **Laba Tahun Berjalan**: angka dari perhitungan yang sama dengan Neraca, dengan chip status Balance/Tidak
     balance dari neraca saldo.
3. Panel **Transaksi Terbaru**, dikelompokkan per tanggal, ±8 baris: keterangan, akun (kalau sudah dikategorikan),
   nominal bertanda dan berwarna.
4. Panel **Perlu Tindakan**, berisi item yang benar-benar ada:
   - upload dengan status `review`
   - upload yang semua transaksinya terkonfirmasi tapi belum dijurnal
   - upload `error`
   - peringatan saldo awal (`balanceWarning`)
   - saldo awal belum diisi

   Semua item bisa diklik ke halaman terkait. Kalau tidak ada item, tampilkan keadaan kosong yang ramah.
5. **Keadaan kosong** (perusahaan baru tanpa data) harus tetap enak dilihat dan mengarahkan ke Upload / Saldo Awal.

**Halaman lain**
- `PageHeader`: judul besar berwarna `ink`, deskripsi abu, dan aksi di kanan.
- Konten utama dibungkus "panel": permukaan putih/near-white, radius besar, dan bayangan lembut atau border tipis.
- **Tabel:** header kecil dengan teks muted, baris lega, hover `pale`, dan angka `tabular-nums` rata kanan.
  Neraca dan Neraca Saldo diberi baris total yang tegas.
- **Form:** input dan select tinggi ±40px dengan radius lebih besar dan fokus ring hijau.
- **Tombol primer** `deep` (atau gradien hijau) dengan bayangan berwarna. Tombol sekunder dan outline netral.
- **Badge status** (`StatusBadge`) berwarna semantik: processing = netral/abu dengan titik berdenyut, review = amber,
  done = hijau, error = merah.
- Dropzone upload memakai ilustrasi atau ikon 3D dan border putus-putus hijau saat drag.
- **Login:** kartu di atas kanvas, logo 3D, dan aksen lime. Konsisten dengan shell.

## Detail kecil yang diputuskan Claude

- Kalau akun bank perusahaan belum diatur, kartu Saldo Bank berisi ajakan "Atur akun bank" (untuk admin) dan tidak
  menampilkan angka.
- Pemasukan dan Pengeluaran dihitung dari baris eStatement (`transactions.credit`/`debit`), termasuk yang belum
  dikonfirmasi, karena keduanya menggambarkan arus kas bank. Labelnya menyebut "arus bank".
- Item "Perlu Tindakan" dan "Langkah berikutnya" disaring sesuai role yang dibutuhkan halaman tujuannya
  (`minRoleForPath`).
- Nomor rekening ditampilkan lengkap. Itu data perusahaan sendiri, dan pengguna aplikasi sudah punya akses ke sana.
- Di HP tidak ada "frame" maupun kanvas abu di pinggir. Sidebar menjadi drawer dan konten memakai lebar penuh dengan
  gutter 16px.

## Diserahkan ke builder

- Pemilihan ikon lucide per menu, bentuk persis objek 3D CSS, serta detail spacing dan tipografi, selama mengikuti
  mockup dan palet.
- **Font: Plus Jakarta Sans** (dipilih Claude, bukan keputusan pemilik). Font sans geometris yang mirip referensi dan
  dibuat oleh desainer Indonesia, dipasang lewat `@fontsource-variable/plus-jakarta-sans`. Fallback ke Inter yang
  sudah terpasang.
- Membuat chart sendiri dengan div/SVG tanpa library chart, kecuali ada alasan kuat.
- **Query data dashboard.** Data baru disediakan dari server di `+page.server.ts` dengan fungsi baru di
  `src/lib/server/reports/` (atau fungsi yang sudah ada dipakai ulang, misalnya `getBalanceSheet`/`getLedger`), dan
  diberi test integrasi.

## Definisi selesai

- Semua halaman di atas memakai gaya baru, dan tidak ada lagi kelas warna slate/blue hardcoded di `src/routes` dan
  `src/lib/components`.
- `bun run test`, `bun run check`, `bun run build`, dan test e2e smoke (`tests/e2e/smoke.spec.ts`) lulus. Kalau ada
  selector e2e yang berubah karena markup baru, test-nya disesuaikan tanpa mengurangi cakupan.
- Dicek visual di browser untuk lebar desktop (±1440px) dan HP (±390px): dashboard, review, neraca, salah satu halaman
  pengaturan, dan login.
