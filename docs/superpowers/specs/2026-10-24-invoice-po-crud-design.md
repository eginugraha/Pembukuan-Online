# Invoice & Purchase Order sebagai dokumen CRUD (tanpa uang muka, status, atau jurnal)

Tanggal: 2026-10-24

## Latar belakang dan tujuan

Saat ini Invoice dan Purchase Order (PO) di Jurnalku diperlakukan sebagai transaksi akuntansi:
punya status (Draft → Terkirim → Lunas, Draft → Diterbitkan → Diterima, Dibatalkan), memposting
jurnal ke Jurnal Umum dan Buku Besar, dan invoice bisa dilunasi lewat bank atau lewat "Uang
Muka". Yang kurang justru hal paling dasar: setelah dokumen dibuat tidak ada cara untuk mengubah
atau menghapusnya kalau ada kesalahan, dan dari daftar tidak ada jalan masuk ke halaman detail.

Pemilik produk menjelaskan bahwa invoice dan PO dikirim ke pihak lain lewat **email terpisah**,
di luar aplikasi. Aplikasi hanya perlu menjadi tempat membuat, mengubah, menghapus, dan mengunduh
PDF dokumen tersebut. Invoice dan PO **tidak boleh** masuk Jurnal Umum maupun Buku Besar.

Tujuan:
1. Invoice dan PO menjadi dokumen biasa dengan CRUD penuh dan unduh PDF.
2. Fitur Uang Muka dihapus seluruhnya.
3. Invoice dan PO tidak lagi menulis ke jurnal. Semua jurnal yang sudah pernah ditulis oleh
   invoice, PO, dan uang muka dibersihkan (datanya hanya data uji, atas keputusan pemilik).

Non-goal (jangan dibangun):
- Pengiriman email dari aplikasi, status dokumen apa pun (Draft/Terkirim/Lunas/Diterima/Batal),
  pencatatan pembayaran, penerimaan barang, stok.
- Pemulihan dokumen yang sudah dihapus, riwayat perubahan/audit.
- Pengaturan nomor dokumen oleh pengguna (format, awalan).

Anti-goal (dianggap gagal walau fiturnya "jalan"):
- Masih ada jalur kode yang menulis ke `journal_entries`/`journal_lines` dari invoice atau PO.
- Sisa UI mati: tombol Kirim/Bayar/Terima/Terbitkan/Batalkan, badge status, menu Uang Muka.
- Entri jurnal bekas invoice/PO/uang muka masih muncul di Jurnal Umum, Buku Besar, atau laporan.

## Keputusan pemilik produk (sebagaimana diputuskan)

- Kontak sudah menjadi CRUD dengan soft delete (selesai, commit `0a94cbe`); invoice dan PO memakai pola yang sama.
- Hanya CRUD dan unduh PDF. Tidak ada kirim dan tidak ada status.
- Invoice dan PO tidak masuk Jurnal Umum maupun Buku Besar.
- Fitur uang muka dihapus.
- Data jurnal lama bekas invoice/PO/uang muka dibersihkan, dan semua invoice/PO yang sudah ada ikut dihapus (data uji).
- Hapus memakai soft delete.
- Daftar mendapat kolom Aksi (Lihat, Ubah, Hapus), seperti halaman Kontak.

## Perilaku yang diinginkan

### Daftar (`/invoicing/invoices`, `/invoicing/purchase-orders`)
- Kolom: nomor, pelanggan/pemasok, tanggal, total. Tanpa kolom/badge status.
- Kolom Aksi per baris: **Lihat** (ke halaman detail), **Ubah**, **Hapus**, dan **PDF**. Ubah dan Hapus hanya untuk peran accountant ke atas; Lihat dan PDF untuk semua peran.
- Hapus meminta konfirmasi lewat dialog lalu soft delete. Dokumen terhapus hilang dari daftar.

### Halaman detail
- Menampilkan nomor, kontak (nama, Attn, posisi), tanggal, baris, subtotal, PPN, total, catatan.
- Tombol: Unduh PDF, Ubah, Hapus. Tidak ada tombol lain.

### Buat dan ubah
- Satu komponen form dipakai untuk buat dan ubah. Setelah menyimpan, pengguna diarahkan ke halaman detail.
- Isi form: kontak, tanggal terbit, baris (keterangan, kuantitas, harga satuan; jumlah dihitung), tarif PPN opsional (persen), catatan. PO juga punya tanggal perkiraan tiba (`expectedDate`, sudah ada).
- Tidak ada lagi isian akun (piutang/hutang, pendapatan/beban, PPN).
- Subtotal, PPN, dan total tetap dihitung **di server** dengan aritmetika desimal yang sudah dipakai sekarang (`toMoney`, `sumMoney`).
- Ubah menimpa seluruh dokumen termasuk barisnya, tanpa batasan apa pun.

### Nomor dokumen
- Nomor (`INV-2026-0001`, `PO-2026-0001`) dibuat otomatis **saat dokumen dibuat** (sebelumnya saat dikirim/diterbitkan), memakai mekanisme penomoran yang ada. Tahun diambil dari tanggal terbit.
- Nomor tidak pernah dipakai ulang walau dokumennya dihapus. Mengubah tanggal terbit ke tahun lain tidak mengubah nomor.

### PDF
- Tata letak yang ada dipertahankan (kop perusahaan, blok "Kepada" dengan Attn dari kontak, tabel baris, total). Baris/label **status dihapus** dari PDF.

### Hak akses
- Lihat dan PDF: viewer ke atas. Buat, ubah, hapus: accountant ke atas (sama seperti buat sekarang). Matriks RBAC pada tes diperbarui.

## Perubahan data

Satu migrasi Drizzle baru (mengikuti pola `drizzle/migrations`). Isi:

1. Hapus semua `journal_entries` yang punya `invoice_id`, `purchase_order_id`, atau `advance_receipt_id` terisi (termasuk entri pembalikan "Pembalikan …"). Baris `journal_lines` ikut terhapus lewat cascade; pemeriksa memverifikasi aturan FK-nya. Setelah itu kolom ketiga penaut tersebut dihapus dari `journal_entries`.
2. Hapus tabel `advance_receipts`, kolom `invoices.paid_via_advance_receipt_id`, dan enum `advance_receipt_status`. Hapus baris counter prefix `UM` di `document_number_counters`.
3. Hapus kolom `status` dan enum `invoice_status`, `po_status`.
4. Hapus kolom akun: `invoices.receivable_account_id`, `invoices.tax_account_id`, `invoice_lines.revenue_account_id`, `purchase_orders.payable_account_id`, `purchase_orders.tax_account_id`, `purchase_order_lines.expense_account_id`. Kolom `tax_rate` dan `tax_amount` dipertahankan.
5. Tambah `deleted_at timestamptz null` pada `invoices` dan `purchase_orders`.
6. Hapus **semua** baris `invoices`, `invoice_lines`, `purchase_orders`, dan `purchase_order_lines` yang sudah ada (keputusan pemilik: datanya data uji), dan reset counter prefix `INV` dan `PO` di `document_number_counters`. Urutan: hapus jurnal (langkah 1) lebih dulu, lalu dokumen, baru ubah kolom.
7. Setelah tabel kosong, nomor dokumen menjadi wajib (`invoice_no`, `po_no` NOT NULL) karena selalu dibuat saat simpan. Unique `(company_id, nomor)` tetap.

## Kode yang dihapus, diubah, dipertahankan

Dihapus:
- Seluruh modul uang muka: `lib/server/invoicing/advance-receipts.ts`, `lib/schemas/advance-receipt.ts`, rute halaman dan API `advance-receipts/*`, item nav "Uang Muka" beserta ikon `advance`, tes terkait.
- `lib/server/invoicing/posting.ts` dan `lib/server/invoicing/accounts.ts` bila setelah perombakan tidak ada pemakai lain (pemeriksa memastikan; `assertAccountOfType` saat ini hanya dipakai modul invoicing).
- Rute API `send`, `pay`, `cancel` (invoice), `issue`, `receive`, `cancel` (PO), serta skema `SendInvoiceInput`, `PayInvoiceInput`, dan padanannya untuk PO.

Diubah:
- `lib/server/invoicing/invoices.ts` dan `purchase-orders.ts`: hanya `create`, `get`, `list`, `update`, `delete`. Tidak ada transaksi posting, tidak ada `assertPeriodOpen`, tidak ada lock perusahaan kecuali dibutuhkan untuk penomoran (sudah atomik di `nextDocumentNumber`).
- `lib/schemas/invoice.ts`, `purchase-order.ts`: buang field dan validasi akun, buang aturan "akun PPN wajib bila tarif diisi".
- Rute API: `invoices` dan `purchase-orders` mendapat `PUT /[id]` (ubah) dan `DELETE /[id]` (hapus); `GET`, `POST`, dan `pdf` dipertahankan.
- Halaman: daftar (kolom Aksi), form buat/ubah (satu komponen bersama, rute ubah mengikuti pola yang paling sesuai dengan struktur rute yang ada), detail (sederhana).
- `drawDocumentPdf` dan dua rute PDF: buang `statusLabel`.
- Tes integrasi/unit/e2e yang mengasumsikan posting, status, atau uang muka ditulis ulang atau dihapus; tambahkan tes untuk ubah, hapus (soft), nomor saat buat, tidak adanya jurnal, dan PDF. Tes e2e `invoicing-smoke` sekarang memeriksa jurnal muncul di halaman Jurnal; diganti dengan alur buat → ubah → PDF/hapus.

Dipertahankan: Kontak (sudah CRUD), penomoran dokumen, pembuat PDF dan kop, `assertContact`.

## Keputusan yang diambil perancang (bisa diubah pemilik produk)

- Buat/ubah/hapus untuk accountant ke atas; hapus tidak khusus admin karena tidak ada lagi dampak ke buku besar.
- Nomor dokumen dibuat saat simpan dan tidak dipakai ulang.
- Mengubah dokumen yang kontaknya kemudian dihapus (soft delete): kontak lama boleh dipertahankan di dokumen itu, tetapi memilih kontak lain hanya dari kontak aktif yang belum dihapus.
- `expectedDate` pada PO dipertahankan.
- Mengganti kontak pada dokumen yang diubah tetap divalidasi jenisnya (pelanggan untuk invoice, vendor untuk PO, `BOTH` untuk keduanya).
- Pembersihan jurnal menghapus juga entri pembalikan; counter `UM` dibersihkan. Pembersihan hanya menyasar entri yang tertaut lewat `invoice_id`, `purchase_order_id`, atau `advance_receipt_id`, untuk semua perusahaan. Datanya data uji, jadi tidak ada cadangan atau dry-run khusus.
- Tidak ada pembatasan ubah/hapus berdasarkan tahun tutup buku atau ekspor, karena dokumen ini tidak lagi menyentuh buku besar.
- Dokumen yang sudah dihapus (soft delete) mengembalikan 404 pada halaman detail, PDF, `PUT`, dan `DELETE`. Barisnya tetap ada, jadi nomornya tetap terpakai dan unique `(company_id, nomor)` tetap menjamin tidak ada nomor ganda.
- Menghapus kontak yang punya invoice/PO tidak diblokir (sama seperti sekarang). Dokumen lama tetap membaca kontaknya lewat `getContact`.
- Saat mengubah dokumen, validasi jenis dan status kontak hanya dijalankan kalau `contactId` berubah. Kontak yang sama dengan sebelumnya selalu diterima.
- Tarif PPN per dokumen tanpa nilai bawaan; pembulatan mengikuti perilaku `toMoney`/`sumMoney` yang ada (per baris, lalu dijumlahkan).
- Penomoran: karena semua dokumen lama dihapus, counter `INV`, `PO`, dan `UM` direset sehingga nomor baru mulai dari 0001.

## Pertanyaan terbuka

Tidak ada.

## Yang diserahkan kepada pembangun

Struktur rute halaman ubah, nama komponen form bersama, urutan langkah migrasi, strategi tes, dan
pembagian tugas dalam rencana implementasi.
