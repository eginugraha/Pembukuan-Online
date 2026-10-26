# Hapus perusahaan & manajemen pengguna (Super Admin)

Tanggal: 2026-10-26

## Maksud

Super Admin saat ini hanya bisa membuat dan mengubah perusahaan, dan hanya bisa mengelola anggota perusahaan yang sedang aktif. Dua hal yang kurang:

1. Perusahaan tidak bisa dihapus.
2. Tidak ada CRUD pengguna di tingkat sistem. Halaman "Pengguna & Role" hanyalah daftar anggota perusahaan aktif (tambah, ubah role, "Lepas"). Akun tidak bisa dilihat lintas perusahaan, diedit (nama, email, password), maupun dihapus.

Multi-company **tetap dipertahankan**. Permintaan awal "hapus fitur multi company" dibatalkan oleh pemilik produk saat brainstorming ini.

## Tujuan

- Super Admin dapat menghapus perusahaan beserta seluruh datanya, dengan pengaman terhadap salah klik.
- Super Admin dapat membuat, melihat, mengubah, dan menghapus pengguna di seluruh sistem, termasuk mengatur perusahaan dan role tiap pengguna.

## Bukan tujuan

- Admin perusahaan (non-Super Admin) **tidak** mendapat hak baru. "Super Admin dulu"; memperluasnya adalah pekerjaan terpisah.
- Tidak ada soft delete / tong sampah / pemulihan perusahaan.
- Tidak ada alur lupa password, undangan email, atau verifikasi email baru.
- Halaman anggota per perusahaan yang ada tetap dan tidak didesain ulang.

## Anti-tujuan (dianggap gagal walau secara teknis jalan)

- Perusahaan terhapus karena salah klik.
- Super Admin terakhir terhapus atau tercabut, sehingga tak ada yang bisa mengelola sistem.
- Pengguna yang dihapus meninggalkan sesi login yang masih aktif.

## Keputusan pemilik produk

- Hapus perusahaan = **hapus permanen semua datanya** (akun, transaksi, jurnal, invoice, PO, kontak, upload, logo, penutupan buku, keanggotaan).
- Wewenang: **hanya Super Admin** untuk kedua fitur.

## Keputusan saya (mohon dikoreksi bila salah)

- Konfirmasi hapus perusahaan: pengguna harus mengetik nama perusahaan persis.
- Setelah perusahaan aktif dihapus, pengguna dipindah ke perusahaan lain yang ia punya. Jika tidak ada, ia melihat halaman "Belum terhubung ke perusahaan". `resolveContext` di `src/lib/server/rbac.ts` sudah jatuh ke keanggotaan pertama bila cookie `jk_company` menunjuk perusahaan yang hilang, jadi tidak perlu mekanisme baru.
- Hapus pengguna: akun dihapus permanen beserta sesi, kredensial, avatar, dan keanggotaan (semua sudah `ON DELETE CASCADE`). Data yang pernah ia buat (jurnal, invoice, PO, upload, konfirmasi, penutupan) **tetap ada**, kolom pembuatnya menjadi kosong (`ON DELETE SET NULL` sudah berlaku di skema). Tampilan yang menampilkan nama pembuat harus tahan terhadap nilai kosong.
- Super Admin tidak bisa menghapus akunnya sendiri, dan tidak bisa menghapus atau mencabut Super Admin terakhir (server yang menegakkan, bukan hanya UI).
- Ubah password oleh Super Admin langsung mencabut semua sesi pengguna itu. Mengubah email mengikuti aturan normalisasi yang ada (`normalizeEmail`) dan menolak email yang sudah dipakai.
- Halaman baru untuk pengguna sistem berada di bawah Pengaturan dan hanya terlihat oleh Super Admin. Nama menu dan rute adalah pilihan builder.

## Batasan

- Stack tetap: SvelteKit, Drizzle, Better Auth, bits-ui/shadcn-svelte. Ikuti pola yang ada: `apiHandler`/`parseJson`, skema zod di `src/lib/schemas`, `FormState`, `DataTable`, `requireSuperAdmin`/`requirePageRole`, pesan antarmuka berbahasa Indonesia.
- Akun kredensial Better Auth memakai `accountId = userId`, `providerId = 'credential'` (lihat `src/lib/server/users/create.ts`). Edit email/password harus menjaga format ini.
- `companies.bankAccountId` menunjuk `accounts` dengan `set null`, sementara `accounts` ikut terhapus bersama perusahaan. Penghapusan harus dilakukan dalam satu transaksi dan diuji agar tidak terhambat oleh ketergantungan melingkar ini.
- Setiap rute API baru wajib punya pemeriksaan otorisasi di server dan tes (unit/integrasi, dan e2e untuk alur utama).

## Diserahkan ke builder

- Bentuk rute API (`DELETE /api/companies/[id]`, endpoint pengguna sistem) dan nama menu.
- Cara menampilkan dan mengedit keanggotaan perusahaan per pengguna di halaman baru.
- Apakah kolom `user.isActive` yang sudah ada ikut diekspos (nonaktifkan tanpa menghapus). Bukan bagian permintaan; boleh dilewati.
- Struktur tes dan pembagian ke beberapa tahap.

## Catatan

Ada perubahan yang belum di-commit di working tree (perbaikan glitch transisi sidebar di `AppSidebar.svelte`, `app.css`, dan tes `sidebar-flicker.spec.ts`). Itu terpisah dari pekerjaan ini dan sebaiknya di-commit sendiri.
