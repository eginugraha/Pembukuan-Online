# Advance Receipt (kuitansi dari invoice)

Tanggal: 2026-10-27

## Maksud

Setiap invoice yang sudah dibayar perlu mengeluarkan satu bukti penerimaan pembayaran: **Advance Receipt**. Dokumennya memakai tata letak invoice yang sudah ada, dengan beberapa perbedaan, dan ditandai stempel **LUNAS**. Receipt diterbitkan **dari invoice** dengan satu tombol, bukan diinput satu per satu, supaya data tidak diketik dua kali dan tidak berbeda dari invoice-nya.

Seperti invoice, receipt hanya dokumen: tidak masuk jurnal umum maupun buku besar, dan tidak ada status.

Dasar yang sudah ada: desain ulang invoice (`docs/superpowers/specs/2026-10-26-invoice-redesign-design.md`, sudah selesai) dan mockup stempel LUNAS yang disetujui (`docs/superpowers/specs/assets/2026-10-26-advance-receipt-lunas-stamp-mockup.html`).

## Tujuan

1. Dari halaman detail sebuah invoice, pengguna menekan **"Terbitkan Advance Receipt"**, mengisi **tanggal pembayaran**, lalu receipt terbit dengan nomornya sendiri.
2. Receipt adalah **salinan tetap** (snapshot) dari invoice saat diterbitkan: pelanggan, perihal, baris, diskon, PPN, mata uang, dan catatan. Mengubah invoice sesudahnya **tidak** mengubah receipt.
3. **Satu invoice, satu receipt** (pembayaran sekali lunas). Tidak ada cicilan.
4. PDF receipt memakai tata letak invoice yang sudah ada, dengan perbedaan berikut:
   - Judul **"ADVANCE RECEIPT"** dengan subjudul miring **"Kuitansi"**.
   - Blok kanan atas berisi "Nomor Receipt / Receipt Number", "Tanggal Pembayaran / Payment Date", dan "Nomor Invoice / Invoice Number" (nomor invoice asalnya). Tidak ada "Jatuh Tempo".
   - **Tidak ada** kartu "INFORMASI PEMBAYARAN / Payment Information".
   - Di tempat kartu pembayaran itu, setelah terbilang, ada paragraf (Bahasa Indonesia saja): *"Dokumen ini merupakan bukti pembayaran atas pembelian {perihal invoice}. Kuitansi ini diterbitkan sebagai bukti penerimaan pembayaran atas transaksi tersebut."* Bila invoice tidak punya perihal, bagian "pembelian {perihal invoice}" diganti "pembelian pada Invoice {nomor invoice}".
   - Tanda tangan bertuliskan **"Acknowledged by,"** sebagai pengganti "Approved by,". Penanda tangan, gambar tanda tangan, dan watermark logo sama seperti invoice.
   - **Stempel LUNAS** di tengah halaman, mengikuti mockup stempel: hijau transparan (≈ 45%), bingkai membulat, huruf tebal besar berjarak, miring ≈ −20°. Digambar di atas konten dan di setiap halaman. Teks di bawah stempel tetap terbaca.
   - Selebihnya sama dengan invoice: label dwibahasa, tabel "RINCIAN TAGIHAN", Subtotal/Diskon/PPN hanya bila ada, terbilang sesuai mata uang, catatan, margin dan tata letak halaman.
5. Format nomor: `NNN/<KODEPERUSAHAAN>-<KODEKONTAK>/ADV/<BULAN-ROMAWI>/<TAHUN>`, misalnya `001/SET-XFORMATION/ADV/IV/2026`. Urutan per perusahaan, per tahun, mulai dari 001, terpisah dari invoice dan PO. Bulan dan tahun diambil dari **tanggal pembayaran**. Kode perusahaan dan kode kontak mengikuti aturan invoice dan wajib ada saat menerbitkan.
6. Di aplikasi:
   - Halaman detail invoice mendapat bagian receipt: bila belum terbit, tombol terbitkan. Bila sudah, tampil nomor, tanggal pembayaran, tautan unduh PDF, dan tombol hapus (dengan konfirmasi).
   - Daftar invoice menandai invoice yang sudah punya receipt.
   - Tidak ada menu sidebar baru.
7. **Hapus receipt** adalah soft delete. Nomornya tidak dipakai lagi. Setelah dihapus, invoice yang sama boleh menerbitkan receipt baru dengan nomor baru.

## Bukan tujuan

- Pembayaran cicilan atau lebih dari satu receipt aktif per invoice.
- Status "lunas/belum" pada invoice. Invoice tidak mendapat status.
- Jurnal, buku besar, atau pencatatan kas/bank.
- Mengubah isi receipt setelah terbit (hapus lalu terbitkan ulang).
- Receipt yang berdiri sendiri tanpa invoice.
- Kartu informasi pembayaran di receipt.
- Pengiriman email, atau mematikan stempel LUNAS.
- Mengubah tampilan PDF invoice. Invoice harus tetap persis seperti sekarang.

## Anti-tujuan (gagal walaupun "jalan")

- Receipt berubah diam-diam setelah invoice-nya diubah.
- Dua receipt aktif untuk satu invoice (termasuk bila tombol ditekan dua kali atau dua pengguna bersamaan).
- Nomor receipt ganda atau berubah setelah terbit.
- Stempel LUNAS menutupi angka sampai tidak terbaca, atau terpotong di tepi halaman.
- Pengguna biasa/penampil bisa menerbitkan atau menghapus receipt.

## Batasan

- Stack yang ada: SvelteKit 2 + Svelte 5, Drizzle/Postgres (migrasi di `app/drizzle/migrations`), zod 4, pdfkit, bun test, dan Playwright.
- PDF tetap dibuat dengan pdfkit di server dan **memakai ulang renderer invoice** (`app/src/lib/server/invoicing/invoice-pdf.ts`) dengan parameter jenis dokumen, bukan menyalin renderernya. Hasil PDF invoice yang sudah ada harus tidak berubah (dijaga tes yang sudah ada).
- Penomoran memakai `nextDocumentNumber` dan `formatDocumentNumber` yang sudah ada, dengan jenis baru `ADV`.
- Pemeriksaan kode perusahaan/kontak dan penetapan nomor terjadi di satu transaksi, sebelum counter bertambah (pola yang sama dengan invoice).
- Hak akses: menerbitkan dan menghapus receipt sama dengan membuat dan menghapus invoice. Membuka halaman dan mengunduh PDF sama dengan melihat invoice.
- Teks UI Bahasa Indonesia. Label PDF dwibahasa seperti invoice.

## Keputusan pemilik produk

- Receipt berasal dari invoice, diterbitkan dengan satu tombol, bukan input manual.
- Satu invoice dibayar sekali lunas, jadi satu receipt.
- Sama dengan invoice: tidak masuk jurnal umum atau buku besar.
- Beda pada format: tidak ada Informasi Pembayaran, tanda tangan "Acknowledged by", stempel LUNAS.
- Paragraf bukti pembayaran di atas, ditaruh di bawah (setelah) bagian terbilang.

## Keputusan saya (bisa dikoreksi)

- Judul "ADVANCE RECEIPT" dengan subjudul "Kuitansi", dan label tanggal "Tanggal Pembayaran / Payment Date". Nama label lain mengikuti pola invoice.
- Letak paragraf bukti pembayaran: tepat setelah terbilang, sebelum catatan dan tanda tangan, sebagai satu blok yang tidak terpotong.
- "title invoice" pada kalimat diartikan sebagai **perihal** invoice, dengan fallback ke nomor invoice bila perihal kosong.
- Salinan tetap (bukan tampilan langsung dari invoice), karena dokumen yang sudah dikirim ke klien tidak boleh berubah.
- Mengubah invoice yang sudah punya receipt tetap diperbolehkan. Halaman detail invoice menampilkan catatan bahwa receipt tidak ikut berubah.
- **Menghapus invoice** yang masih punya receipt aktif ditolak dengan pesan "Hapus receipt terlebih dahulu".
- Tanggal pembayaran wajib diisi, default hari ini, dan boleh sebelum tanggal invoice (namanya juga "advance"). Tidak ada validasi terhadap tanggal invoice.
- Nilai receipt selalu sama dengan total invoice saat diterbitkan.
- **Apa yang dibekukan:** data pelanggan (nama, attention, posisi, alamat, email, telepon, NPWP), nomor invoice asal, perihal, baris, nominal, mata uang, dan catatan disalin ke receipt. **Data perusahaan** (nama, alamat, logo, email, telepon, penanda tangan, tanda tangan, watermark) dibaca langsung saat PDF dibuat, sama seperti invoice sekarang.
- Kode kontak di nomor receipt diambil dari kontak saat receipt diterbitkan. Bila kosong, penerbitan ditolak (422), sama seperti invoice. Nomor yang sudah terbit tidak berubah.
- Nomor receipt yang sudah dihapus tetap dianggap terpakai: unik per perusahaan **termasuk baris yang sudah dihapus**.
- Invoice yang sudah dihapus tidak bisa menerbitkan receipt, dan tidak ada receipt yang tampil tanpa invoice aktif.
- Teks catatan di detail invoice yang sudah punya receipt: "Receipt sudah terbit. Perubahan pada invoice ini tidak mengubah receipt."
- Hapus receipt: soft delete biasa, tanpa alasan dan tanpa jejak audit tambahan.
- Hak akses mengikuti pemeriksaan peran yang dipakai buat/hapus invoice. Stempel hanya berbunyi "LUNAS" (Bahasa Indonesia saja), dengan tampilan persis mockup stempel.
- Stempel di setiap halaman, di tengah halaman, tanpa pilihan untuk mematikannya.
- Counter nomor memakai kunci `ADV:v2` di `document_number_counters` (varchar 10) agar polanya sama dengan `INV:v2`/`PO:v2`.

## Diserahkan ke pembangun

- Bentuk tabel (misalnya `advance_receipts` + `advance_receipt_lines`, atau satu tabel dengan baris disimpan sebagai salinan), dan cara menjamin satu receipt aktif per invoice (misalnya indeks unik parsial pada invoice yang belum dihapus).
- Rute API dan nama berkas (misalnya `POST /api/invoicing/invoices/[id]/receipt`, `DELETE`, dan `GET …/pdf`).
- Cara memparameterkan renderer PDF dan koordinat/ukuran stempel, asalkan setia pada mockup stempel dan tidak menutupi angka.
- Tampilan bagian receipt di halaman detail invoice dan penanda di daftar.
- Cara menangani invoice yang receipt-nya sudah dihapus lalu diterbitkan ulang pada tahun/bulan berbeda.
- Tes: integrasi (penerbitan, snapshot tidak berubah, satu receipt aktif, kode wajib, hapus lalu terbit ulang, hak akses), PDF (label, paragraf, tanpa kartu pembayaran, stempel, PDF invoice tidak berubah), dan e2e.
