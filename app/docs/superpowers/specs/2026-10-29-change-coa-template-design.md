# Ganti Template Bagan Akun untuk Perusahaan yang Sudah Berjalan

Tanggal: 2026-10-29

## Intent

Template bagan akun (CoA) saat ini hanya dipilih sekali, waktu perusahaan dibuat (`coaTemplate` di `CreateCompanyInput`, dipakai oleh `seedCompany`). Pengguna punya perusahaan yang sudah berisi jurnal dan transaksi, tapi dibuat dengan template yang kurang cocok (contoh nyata: dibuat dengan template **Umum**, padahal bisnisnya **IT/Software**). Mereka ingin bisa pindah ke template lain dari **Pengaturan Perusahaan** tanpa kehilangan data yang sudah ada.

Keputusan pengguna:

- **Akun lama tetap ada.** Tidak ada yang dihapus; jurnal, invoice, PO, kuitansi, quotation, dan transaksi lama tetap menempel ke akun yang sama.
- **Akun lama yang tidak ada di template tujuan harus direview ulang**, bukan dibiarkan diam-diam.
- **Setiap akun yang kodenya bentrok diputuskan sendiri oleh pengguna lewat layar review satu per satu**, bukan otomatis.
- **Layout layar review: bertahap per kelompok (layout "B")**, yaitu tiga langkah berurutan dengan kartu per akun.
- Gambaran alur di bawah (termasuk tebakan yang ditandai sebagai keputusan builder/asisten) sudah dikonfirmasi pengguna: "sudah sesuai".

## Kenapa ini tidak sepele

Kedua template memakai **kode yang sama untuk akun yang berbeda arti**. Dari `coa-data.ts` (Umum, 76 akun) vs `coa-it.ts` (IT, 94 akun):

- **25 kode bentrok nama/arti**, misalnya `1-2101` Tanah → Komputer & Laptop, `1-1005` Persediaan → Pendapatan Belum Ditagih (Aset Kontrak), `4-1002` Pendapatan Penjualan → Pendapatan Langganan (SaaS), `5-1001` HPP — Bahan Baku → Gaji Tim Proyek & Developer.
- **1 kode** juga berbeda saldo normal: `4-1003` Retur & Potongan Penjualan (REVENUE/**DEBIT**, kontra-pendapatan) → Pendapatan Maintenance & Support (REVENUE/**CREDIT**).
- **19 akun hanya ada di IT** (PPh 23/25 Dibayar Dimuka, Uang Muka & Deposit, Amortisasi + akumulasinya, Pendapatan Lisensi/Konsultasi, Selisih Kurs, Beban SaaS, dll.).
- **1 akun hanya ada di Umum**: `1-2105` Inventaris Kantor.

Kalau hanya mencocokkan kode dan mengganti nama, akun "Tanah" yang sudah berisi jurnal tiba-tiba menjadi "Komputer & Laptop", dan laporan keuangan masa lalu ikut berubah arti. Itu yang harus dicegah: semua perubahan nama terjadi hanya karena pengguna memilihnya.

## Goals

1. Admin perusahaan bisa memulai "Ganti template bagan akun" dari halaman Pengaturan Perusahaan dan memilih template tujuan.
2. Layar review bertahap menampilkan perbedaan antara **CoA perusahaan saat ini** dan **template tujuan**, dan pengguna memutuskan setiap perbedaan.
3. Semua perubahan diterapkan sekaligus dalam satu transaksi database: berhasil semua atau batal semua.
4. Tidak ada data transaksi historis yang diubah atau dipindah akunnya.

## Non-goals

- Memindahkan/merekelas jurnal lama dari satu akun ke akun lain (sudah ada `deleteAccount(..., moveToId)` untuk itu secara manual).
- Menghapus akun. Akun hanya bisa **dinonaktifkan**.
- Membuat template baru atau editor template.
- Mengubah kode akun yang sudah ada (renumbering).

## Anti-goals (gagal walaupun "jalan")

- Nama akun berubah tanpa pengguna memilihnya.
- Saldo normal / tipe akun yang sudah punya jurnal berubah sehingga saldo historis terbaca terbalik.
- Penerapan setengah jalan (sebagian akun berubah, sebagian tidak) karena error di tengah.
- Akun buatan pengguna sendiri hilang atau berubah tanpa review.

## Alur

### Masuk

Di `src/routes/(app)/settings/company/+page.svelte` ada tombol **"Ganti template bagan akun"** (hanya untuk role `admin` ke atas, sama seperti `PATCH /api/companies/[id]`). Pengguna memilih template tujuan dari `COA_TEMPLATES`, lalu masuk ke layar review (halaman sendiri, misalnya `/settings/company/coa-template`). **Tidak ada yang berubah sampai tombol terakhir ditekan.**

### Perbandingan

Server membandingkan akun perusahaan saat ini (dari tabel `accounts`, `companyId` aktif) dengan daftar akun template tujuan (`COA_TEMPLATE_DATA[target].coa`) **berdasarkan kode**. Setiap kode masuk ke salah satu kelompok:

| Kelompok | Kondisi | Langkah |
|---|---|---|
| Sama | kode ada di keduanya, nama + tipe + saldo normal sama | tidak ditampilkan |
| Bentrok | kode ada di keduanya, nama ATAU tipe ATAU saldo normal berbeda | Langkah 1 |
| Tidak ada di template tujuan | kode ada di perusahaan, tidak ada di template | Langkah 2 |
| Akun baru | kode ada di template, tidak ada di perusahaan | Langkah 3 |

Perbandingan dilakukan terhadap kondisi CoA perusahaan **saat ini**, bukan terhadap template asalnya. Akun yang sudah diganti nama atau ditambah sendiri oleh pengguna otomatis masuk kelompok yang tepat. Perusahaan juga tidak perlu tahu dari template mana ia dulu dibuat.

Setiap akun perusahaan yang ditampilkan menyertakan **jumlah jurnal yang memakainya** (pakai/ikuti `getAccountUsage` di `src/lib/server/accounts/delete.ts`).

### Langkah 1: Kode bentrok

Satu kartu per akun: kode, nama sekarang, nama di template tujuan, jumlah jurnal. Pilihan (radio):

- **Ganti nama ke versi template**: akun yang ada di-update nama (dan tipe/saldo normal/induk bila berbeda) mengikuti template.
- **Tetap nama lama**: akun yang ada tidak disentuh, lalu akun template dibuat sebagai akun baru dengan **kode baru**.

Pengguna tidak bisa lanjut ke Langkah 2 sebelum semua kartu diputuskan. Ada penanda "N dari M belum dipilih".

### Langkah 2: Akun yang tidak ada di template tujuan

Isinya akun bawaan template lama yang tidak ada di template tujuan (contoh: Inventaris Kantor `1-2105`) **dan** akun buatan pengguna sendiri. Pilihan per akun: **Biarkan** (default) atau **Nonaktifkan** (`isActive = false`, tidak dihapus).

### Langkah 3: Akun baru dari template

Daftar akun template yang belum ada, semuanya **tercentang secara default**. Pengguna bisa menghapus centang untuk yang tidak perlu. Akun yang di Langkah 1 dipilih "tetap nama lama" juga muncul di sini dengan kode barunya, sehingga pengguna bisa melihat dan melewatinya.

### Ringkasan & Terapkan

Ringkasan: X akun diganti nama, Y akun ditambahkan, Z akun dinonaktifkan, R aturan kategorisasi ditambahkan. Tombol **Terapkan** menjalankan semuanya dalam **satu `db.transaction`**. Kalau gagal, tidak ada yang berubah dan pengguna melihat pesan error.

## Aturan kategorisasi (`category_rules`)

Template juga membawa rule SYSTEM (`DEFAULT_RULES` / `IT_RULES`, misalnya "TOKOPEDIA" → `4-1002`). Keputusan (tebakan asisten, dikonfirmasi pengguna bersama gambaran alur):

- **Rule yang sudah ada tidak diubah dan tidak dihapus.** Rule tetap menunjuk `accountId` yang sama, jadi rule "TOKOPEDIA" tetap mengarah ke akun yang sama walaupun akun itu diganti nama.
- **Rule template tujuan yang belum ada ditambahkan** (`source: 'SYSTEM'`). Rule "sudah ada" berarti ada rule dengan `keywordPattern` + `direction` yang sama (case-insensitive pada keyword) di perusahaan itu.
- Rule baru diarahkan ke akun yang mewakili kode template tersebut setelah penerapan: akun yang ada (kalau sama/diganti nama), akun baru yang dibuat (termasuk yang mendapat kode baru), atau **dilewati** kalau akun tujuannya dilewati pengguna di Langkah 3.

## Batasan

- Semua penulisan di satu transaksi. Ikuti pola `seedCompany` (insert induk sebelum anak, peta `code → id`).
- Akun baru harus punya induk yang valid. Induk ditentukan dari `parent` di template, diterjemahkan ke akun perusahaan setelah penerapan. Kalau kode induknya diberi kode baru, pakai kode baru itu. Kalau induknya dilewati pengguna, lihat "Diserahkan ke builder".
- `accounts_company_code_uq` (unik `companyId + code`): kode baru tidak boleh bentrok dengan akun yang ada, termasuk akun nonaktif.
- Service perlu memvalidasi ulang di server bahwa keputusan dari client lengkap dan sesuai dengan perbandingan terbaru. Kalau CoA berubah antara review dan Terapkan, tolak dengan error yang jelas (409) dan minta pengguna memuat ulang.
- Hanya perusahaan aktif (`ctx.companyId`) yang bisa diubah.

## Keputusan asisten (bukan dari pengguna)

1. **Kode baru untuk akun detail (leaf) yang "tetap nama lama"**: sistem otomatis memberi kode kosong berikutnya di kelompok induk yang sama (contoh: `1-2101` bentrok → akun IT "Komputer & Laptop" dapat `1-2106` kalau `1-2105` terpakai). "Kosong" berarti tidak dipakai akun perusahaan mana pun (aktif atau nonaktif) **dan** tidak dipakai akun template tujuan yang akan ditambahkan. Contoh: menyimpan `4-1003` tidak boleh menghasilkan `4-1004`, karena IT menambahkan `4-1004` Pendapatan Lisensi. Kode tidak bisa diedit di layar ini. Pengguna bisa mengubahnya nanti lewat halaman akun kalau perlu. Kode baru ditampilkan di kartu Langkah 1 begitu "tetap nama lama" dipilih.
1a. **Akun induk (header) yang bentrok** (contoh nyata: `5-1000` HPP vs Beban Pokok Pendapatan): "Tetap nama lama" hanya berarti tidak diganti nama. **Tidak dibuat header duplikat dengan kode baru.** Struktur pohon tetap mengikuti kode: akun anak template (`5-1001`–`5-1004`) tetap berada di bawah akun yang memegang kode induknya (`5-1000`), apa pun namanya.
1b. **"Ganti nama" tidak pernah memindah induk akun yang sudah ada**, kecuali kode induk di template berbeda dari kode induk sekarang. Ini menggantikan keputusan 6 lama; antara Umum dan IT tidak ada kasus kode induk yang berbeda. Akun baru ditempatkan di bawah akun perusahaan yang memegang kode `parent` di template.
1c. **Akun nonaktif yang kodenya cocok dengan template** tetap dihitung "ada" (karena unique key). Kalau namanya sama, akun itu tidak disembunyikan, melainkan muncul di Langkah 1 sebagai kartu "Akun ini nonaktif" dengan pilihan **Aktifkan kembali** (default) / **Biarkan nonaktif**. Kalau namanya bentrok, kartu biasa ditambah centang "aktifkan kembali". Rule template baru yang menunjuk akun yang tetap nonaktif **tidak ditambahkan**, karena `categorize/rules.ts` melewati rule berakun nonaktif.
1d. **Peringatan nama ganda**: setelah keputusan dibuat, kalau ada dua akun aktif dengan nama yang sama (contoh: `1-2103` tetap "Kendaraan" sementara `1-2104` diganti nama jadi "Kendaraan"; atau `1-2105` "Inventaris Kantor" dibiarkan sementara `1-2103` diganti nama ke nama yang sama), kartu terkait dan ringkasan menampilkan peringatan kuning. Peringatan ini **tidak memblokir** Terapkan. Pencocokan tetap berdasarkan kode, tanpa pencocokan nama otomatis.
2. **Bentrok yang tipe atau saldo normalnya berbeda dan akunnya sudah punya jurnal**: opsi "Ganti nama" **dinonaktifkan**, dan pengguna hanya bisa memilih "Tetap nama lama". Alasannya ada di anti-goal: saldo historis bisa terbaca terbalik. Saat ini kasus ini hanya `4-1003`. Kalau akunnya belum punya jurnal, ganti nama + ganti saldo normal boleh.
3. **Role**: `admin` (sama dengan edit pengaturan perusahaan), bukan hanya super admin.
4. **Template asal tidak disimpan** di `companies`. Perbandingan selalu terhadap CoA saat ini, jadi kolom baru tidak diperlukan. Fitur ini juga bisa dijalankan ulang kapan saja, termasuk kembali ke Umum.
5. **`companies.bankAccountId` tidak diubah.**
6. (Digantikan oleh 1a/1b.)

## Diserahkan ke builder

- Bentuk API (misalnya `GET .../coa-template/preview?target=it` dan `POST .../coa-template/apply`) dan struktur payload keputusan.
- Lokasi service (disarankan `src/lib/server/company/change-template.ts`) dan pemecahan fungsi perbandingan murni vs penerapan.
- Perilaku kalau pengguna melewati akun baru yang menjadi induk akun baru lain di Langkah 3. Saran: menghapus centang induk otomatis menghapus centang anak-anaknya, atau checkbox induk terkunci selama ada anak yang tercentang.
- Komponen UI detail, dengan mengikuti komponen yang sudah ada (`Card`, `FormField`, `SimpleSelect`, dll.).
- Tes: unit untuk fungsi perbandingan (memakai data Umum → IT nyata, termasuk `4-1003`, `1-2105`, header `5-1000`, akun nonaktif, dan peringatan nama ganda `1-2103`/`1-2104`), integration untuk apply (atomik, jurnal lama tetap di akun yang sama, rule lama tidak berubah, rule baru ditambahkan, 409 saat CoA berubah, non-admin ditolak).
