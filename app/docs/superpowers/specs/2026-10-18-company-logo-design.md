# Logo Perusahaan — Design Spec

## Intent

Perusahaan (tenant) bisa mengunggah logo sendiri, dipotong jadi persegi lewat alat crop interaktif, lalu logo itu tampil di dashboard dan (begitu fitur export PDF ada) di kop laporan. Ini satu dari empat permintaan besar pengguna (export, input manual, logo, invoicing); dokumen ini hanya mencakup logo. Export, input manual, dan invoicing masing-masing akan punya brainstorming dan spec terpisah, dalam urutan: logo → export → input manual → invoicing.

## Why now

Aplikasi sudah di-rebrand jadi "pena" dengan logo huruf "P" generik. Pengguna ingin laporan dan dashboard terasa milik perusahaan mereka sendiri, bukan generik "pena" — terutama untuk laporan yang nanti dicetak/diunduh (RUPST, tutup buku, dsb).

## Goals

- Admin perusahaan bisa mengunggah, meng-crop (geser & zoom, bukan auto-center seperti foto profil), dan menghapus logo perusahaan.
- Logo tampil di halaman dashboard, di dekat nama perusahaan.
- Model data & cara penyajian logo disiapkan agar laporan PDF (fitur mendatang) tinggal memakainya di kop, berdampingan dengan nama & alamat perusahaan — tidak menggantikan teks yang sudah ada.
- Kalau perusahaan belum punya logo, tampilan tetap seperti sekarang (tanpa gambar).

## Non-goals

- Logo TIDAK dipakai sebagai favicon — favicon tetap logo "pena".
- Tidak membangun fitur export PDF di sini — itu dependensi ke depan, bukan bagian dari scope ini. Kop laporan PDF akan ikut pakai logo ini nanti saat fitur export dibangun; tidak ada pekerjaan tambahan yang perlu diantisipasi sekarang selain menyediakan data dan URL yang stabil.
- Tidak menambahkan logo ke sidebar/top-bar aplikasi (branding "pena" di sana tidak berubah).
- Tidak menambahkan logo per-user (beda dari foto profil yang sudah ada).

## Anti-goals (gagal walau "jalan")

- Crop yang auto-center seperti avatar (tanpa kendali pengguna) — pengguna sudah secara eksplisit minta kendali geser/zoom.
- Upload tanpa validasi tipe/ukuran file yang bisa menyimpan file rusak atau sangat besar di database.
- Logo bocor ke perusahaan lain (harus terikat `companyId`, sama seperti data lain di app ini).

## Current state (dari eksplorasi codebase)

- Pola yang sudah ada untuk foto profil (`src/lib/server/users/avatar.ts`, tabel `user_avatars`): gambar disimpan sebagai `bytea` di Postgres (bukan storage eksternal), di-resize ke persegi 256×256 WebP **di browser** sebelum upload, lalu disajikan lewat route dedicated (`/api/users/[id]/avatar`) dengan URL ber-`?v=timestamp` untuk cache-busting. Tidak ada library crop — resize persegi dilakukan manual lewat `canvas` (`src/lib/image.ts`, fungsi `squareResize`), tapi itu **auto-center-crop**, bukan interaktif.
- Tidak ada library crop (`cropperjs`, `svelte-easy-crop`, dll) di `package.json`. Proyek ini secara konsisten membangun UI kustom dari primitif platform daripada menambah dependency baru (lihat `$lib/charts.ts` untuk grafik dashboard) — spec ini mengikuti pola itu: crop interaktif dibangun dari `<canvas>` + pointer events, tanpa dependency baru.
- Tabel `companies` (`src/lib/server/db/schema.ts`) belum punya kolom logo apa pun.
- `AppContext`/`resolveContext` di `src/lib/server/rbac.ts` sudah membawa daftar `companies: CompanyMembership[]` (id, name, role) ke semua halaman — ini jalur yang sama dipakai dashboard untuk nama perusahaan (`src/routes/(app)/dashboard/+page.svelte:39`). Menambah `logoUrl` di sini membuatnya tersedia gratis di semua halaman tanpa query tambahan.
- Pengaturan perusahaan ada di `src/routes/(app)/settings/company/+page.svelte`, dengan form `UpdateCompanyInput` lewat `PATCH /api/companies/[id]`, dijaga `requireRole(event, 'admin')`.
- Belum ada fitur export/PDF sama sekali di codebase (tidak ada library PDF di `package.json`, tidak ada kode yang merender laporan ke PDF). Ini dikonfirmasi lewat pencarian kode, bukan tebakan.

## Decisions made with the user

- Logo dipakai di: dashboard, dan (nanti) kop laporan PDF — **berdampingan** dengan nama & alamat perusahaan, bukan menggantikan teks yang ada.
- Logo **tidak** dipakai sebagai favicon.
- Upload logo punya langkah **crop interaktif** (geser/zoom) agar hasilnya seragam persegi — berbeda dari foto profil yang auto-center-crop.

## Decisions left to the builder (this document's calls)

- **Penyimpanan:** tabel baru `company_logos` (`companyId` primary key + FK `onDelete: cascade` ke `companies`, kolom `content: bytea`, `mime`, `updatedAt`), persis mengikuti pola `user_avatars`. Kolom `companies.logoUrl: text` (nullable) menyimpan URL publiknya, sama seperti `user.image` — di-set/di-null-kan bersamaan dengan insert/delete `company_logos` dalam satu transaksi.
- **Endpoint:** `PUT /api/companies/[id]/logo` (set logo, body `FormData` field `file`) dan `DELETE /api/companies/[id]/logo`, dijaga `requireRole(event, 'admin')` + cek `params.id === ctx.companyId` (sama seperti route `PATCH /api/companies/[id]` yang sudah ada). Penyajian gambar lewat `GET /api/companies/[id]/logo` publik-terautentikasi (perlu login + jadi anggota company itu), analog `/api/users/[id]/avatar`.
- **Validasi:** sniff magic bytes (JPEG/PNG/WebP) seperti `sniffImage` di `avatar.ts`; batas ukuran setelah diproses di klien: 512 KB (sama seperti avatar) — klien selalu kirim WebP persegi, jadi ini pagar pengaman, bukan jalur utama.
- **Crop interaktif:** komponen baru `LogoCropDialog.svelte` — dialog modal dengan `<canvas>`, pengguna bisa geser gambar (pointer drag) dan zoom (slider/scroll), area crop persegi tetap di tengah dialog. **Zoom minimum = seluruh logo muat di kotak** (fit-inside), bukan fill-the-square seperti avatar — kebanyakan logo perusahaan adalah wordmark memanjang, dan default-nya tidak boleh memotong bagian logo. Pengguna bebas zoom in lebih jauh (sampai fill) kalau mau crop lebih ketat. Area di luar logo (saat fit-inside menyisakan ruang kosong di atas/bawah atau kiri/kanan) **dibiarkan transparan**, bukan diisi putih — kanvas tidak di-fill sebelum `drawImage`. Saat konfirmasi, canvas di-`toBlob()` jadi WebP **dengan alpha dipertahankan** (kualitas 0.92, sisi 512px — lebih besar dari avatar 256px karena logo dipakai juga sebagai kop laporan beresolusi cetak), dikirim ke endpoint PUT. Tidak ada dependency baru.
- **Dimensi output:** 512×512 WebP ber-alpha (vs 256×256 opaque pada avatar) — logo butuh ketajaman lebih untuk kop PDF nanti, dan transparansi dipertahankan agar warna asli logo tidak berubah saat nanti ditempel di kop PDF berlatar putih.
- **Tampilan dashboard:** `PageHeader.svelte` dapat prop opsional baru `logoUrl?: string | null`; kalau diisi, tampil sebagai gambar persegi kecil di sebelah kiri judul `<h1>`, dibungkus chip berlatar terang tetap (mis. `size-10 rounded-lg bg-white p-1 object-contain`, latar tidak ikut dark mode) — karena file yang disimpan transparan, logo gelap tidak boleh hilang di dark mode. Prop ini hanya diisi oleh halaman dashboard (`title="Dashboard"`), bukan halaman lain — menjaga scope "tampil di dashboard" sesuai permintaan, bukan menyebar ke seluruh app.
- **Resolusi lewat `ctx`:** `CompanyMembership` di `rbac.ts` dapat field baru `logoUrl: string | null`; `resolveContext` ikut men-select `companies.logoUrl`. Dashboard mengambilnya persis seperti `companyName` sekarang: `data.ctx.companies.find((c) => c.id === data.ctx.companyId)?.logoUrl`.
- **Siapa yang bisa upload:** admin perusahaan (`requireRole(event, 'admin')`), konsisten dengan hak edit data perusahaan lain di `settings/company`.
- **Lokasi UI upload:** halaman `settings/company`, di dekat field nama/alamat perusahaan yang sudah ada (card baru "Logo Perusahaan" di atas atau di samping form yang ada).
- **Siap untuk PDF nanti:** karena logo disajikan lewat URL stabil (`/api/companies/[id]/logo`) dan juga bisa diambil langsung sebagai bytes dari service (`getCompanyLogo(companyId)` mengembalikan `{content, mime}` seperti `getAvatar`), fitur export PDF nanti bisa langsung memanggil service ini untuk menyisipkan logo ke kop — tidak perlu desain ulang data.

## Constraints

- Tidak ada dependency baru (ikuti pola proyek: bangun dari primitif platform).
- Tidak mengubah tata letak laporan yang sudah ada sekarang (karena PDF belum ada, tidak ada yang berubah secara visual di luar dashboard & settings pada fase ini).
- Format file input: JPEG/PNG/WebP saja (sama seperti avatar), maks 5 MB sebelum diproses di klien.
- Harus bisa dihapus (balik ke "tanpa logo") oleh admin.

## What's left to the builder

- Nama CSS class/ukuran pasti chip logo di dashboard (boleh menyesuaikan skala visual yang sudah ada di `PageHeader.svelte`).
- Pesan error persis (ikuti gaya Bahasa Indonesia yang sudah ada di `avatar.ts`/`UpdateCompanyInput`).
- Detail interaksi crop (drag vs slider zoom, batas zoom minimum/maksimum) — asal hasil akhirnya persegi dan representatif dari pilihan pengguna.
