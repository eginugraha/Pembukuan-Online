# Penawaran (Quotation) dengan revisi dan status

Tanggal: 2026-10-29

## Maksud

Sebelum menagih, pengguna mengirim **penawaran harga (quotation)** ke calon klien. Proposal dibuat terpisah di luar aplikasi; aplikasi hanya membuat dokumen rincian harga. Bila ada negosiasi, penawaran **direvisi** dengan nomor yang sama ditambah akhiran `-R1`, `-R2`, supaya jejak negosiasi tetap satu nomor. Bila klien setuju, pengguna menandainya **Disetujui**, lalu membuat invoice DP **secara manual** seperti sekarang (tidak ada konversi otomatis).

Klien biasanya tidak mengabari bila menolak, jadi tidak ada status "Ditolak": penawaran yang tidak disetujui sampai tanggal *berlaku sampai* lewat dianggap **Kedaluwarsa** secara otomatis. Tanggal *berlaku sampai* **opsional**; tanpa tanggal itu penawaran tidak pernah kedaluwarsa. Status kedaluwarsa tidak menghalangi deal: penawaran kedaluwarsa tetap bisa langsung ditandai Disetujui.

Seperti invoice, penawaran hanya dokumen: tidak masuk jurnal umum maupun buku besar.

Dasar yang sudah ada: invoice dan PO (`2026-10-24-invoice-po-crud-design.md`, `2026-10-26-invoice-redesign-design.md`), penandatangan majemuk, dan catatan berformat (rich text) di form dokumen.

## Tujuan

1. Menu **Penawaran** di grup Invoicing (sebelum Invoice), berisi daftar, buat, detail, ubah, hapus, revisi, tandai disetujui, dan unduh PDF.
2. **Form** sama dengan form invoice (`DocumentForm`), dengan perbedaan: **Berlaku sampai** (opsional, tidak boleh sebelum tanggal penawaran) menggantikan Jatuh tempo. Field lain sama: pelanggan, tanggal, perihal, mata uang, diskon, PPN, baris, catatan berformat.
3. **Nomor**: `NNN/<KODEPERUSAHAAN>-<KODEKONTAK>/QUO/<BULAN-ROMAWI>/<TAHUN>`, misalnya `001/SAB-PLG/QUO/X/2026`. Urutan per perusahaan per tahun, terpisah dari invoice, PO, dan receipt. Bulan dan tahun dari tanggal penawaran **versi pertama**. Kode perusahaan dan kontak wajib, mengikuti aturan invoice.
4. **Revisi**: tombol **Buat Revisi** di detail versi terbaru membuka form berisi salinan isi versi itu. Saat disimpan, terbit versi baru dengan nomor dasar yang sama dan akhiran `-R<n>` (`001/SAB-PLG/QUO/X/2026-R1`, lalu `-R2`). Revisi tidak menaikkan counter nomor. Versi sebelumnya **terkunci** (hanya lihat dan unduh PDF) dan tampil sebagai **riwayat revisi** di halaman detail. Daftar penawaran hanya menampilkan versi terbaru tiap nomor.
5. **Status** (versi terbaru):
   - Urutan penentuan: Disetujui, lalu Kedaluwarsa, lalu Menunggu.
   - **Disetujui**: ditandai manual lewat tombol **Tandai Disetujui**, dari status Menunggu **maupun Kedaluwarsa**. Bisa dibatalkan lewat **Batalkan persetujuan**; setelah dibatalkan status dihitung ulang dari tanggal.
   - **Kedaluwarsa**: belum disetujui, tanggal berlaku sampai diisi, dan hari ini > tanggal itu. Dihitung saat dibaca, tidak disimpan, tanpa job terjadwal.
   - **Menunggu**: selain di atas, termasuk penawaran tanpa tanggal berlaku sampai.
   - Versi lama di riwayat berlabel **Direvisi**.
6. **Aturan kunci**:
   - Hanya versi terbaru yang bisa diubah, direvisi, disetujui, atau dihapus.
   - Penawaran **Disetujui** tidak bisa diubah, direvisi, atau dihapus sampai persetujuannya dibatalkan.
   - Penawaran **Kedaluwarsa** tetap bisa diubah dan direvisi. Revisi baru membawa tanggal berlaku sampai baru, sehingga statusnya kembali Menunggu.
   - **Ubah** (tanpa revisi) untuk koreksi sebelum dikirim: menimpa versi terbaru tanpa mengganti nomor.
   - **Pelanggan dikunci** saat Ubah dan saat Buat Revisi: tampil di form tapi tidak bisa diganti, dan server menolak perubahan kontak. Satu nomor penawaran selalu untuk satu pelanggan; pelanggan lain berarti penawaran baru.
   - Mengubah tanggal penawaran (Ubah atau revisi) **tidak** mengganti nomor dasar; bulan/tahun di nomor tetap dari versi pertama.
7. **PDF**: tata letak, logo, watermark, label dwibahasa, dan gaya sama dengan invoice, dengan perbedaan:
   - Judul **PENAWARAN** dengan subjudul miring **Quotation** (pola judul dwibahasa seperti receipt).
   - Blok kanan atas: Nomor / Number (lengkap dengan akhiran revisi), Tanggal / Date, **Berlaku sampai / Valid Until** (hanya bila diisi). Tidak ada jatuh tempo.
   - Blok pelanggan berlabel **DITAWARKAN KEPADA / QUOTED TO**.
   - Tabel berlabel **RINCIAN PENAWARAN / Quotation Details**.
   - **Tidak ada** kartu informasi pembayaran.
   - Terbilang, catatan berformat, Subtotal/Diskon/PPN (hanya bila ada), dan penandatangan (dipilih saat unduh, pilihan terakhir diingat per dokumen) sama seperti invoice.
   - Nama file `quotation-<nomor dengan / dan karakter tak aman diganti ->.pdf`, mengikuti pola invoice.
8. **Hapus** versi terbaru adalah soft delete. Bila ada versi sebelumnya, versi sebelumnya kembali menjadi versi terbaru (dan bisa diubah/direvisi lagi). Bila yang dihapus versi pertama tanpa revisi, penawaran hilang dari daftar. Nomor dasar dan nomor revisi yang sudah terpakai tidak pernah dipakai ulang (revisi berikutnya memakai nomor revisi tertinggi yang pernah ada + 1, termasuk yang terhapus).
9. **Kunci pelanggan di invoice dan PO** (dikerjakan sekalian): form **Ubah** invoice dan PO menampilkan pelanggan/vendor tanpa bisa diganti, dan server menolak perubahan `contactId` saat update. Nomor yang sudah ada tidak diubah, termasuk invoice lama yang kodenya sudah tidak cocok. Salah pelanggan berarti hapus lalu buat baru.
10. **Peran**: sama dengan invoice. Lihat dan unduh: `viewer`. Buat, ubah, revisi, setujui, batalkan persetujuan, hapus: `accountant`.

## Bukan tujuan

- Konversi penawaran menjadi invoice atau invoice DP otomatis.
- Status "Ditolak" atau "Terkirim"; pengiriman email dari aplikasi.
- Proposal, lampiran, atau dokumen pendukung di dalam aplikasi.
- Kartu informasi pembayaran (rekening bank) di PDF.
- Membandingkan revisi baris per baris (diff).
- Pencatatan jurnal atau dampak ke laporan keuangan.

## Batasan

- Mengikuti pola invoice yang sudah ada: Drizzle + migrasi drizzle-kit, layanan di `src/lib/server/invoicing/`, API di `src/routes/api/invoicing/`, halaman di `src/routes/(app)/invoicing/`, `DocumentForm`, `invoice-pdf.ts`, `numbering.ts` (jenis baru `QUO`, counter `QUO:v2`), penandatangan via `signerForDownload` dan kolom `last_signer_id`.
- Data kontak di penawaran merujuk ke kontak secara langsung (seperti invoice), bukan salinan.
- "Hari ini" untuk status memakai helper tanggal yang sudah dipakai aplikasi (`todayIso`).
- Kontak dan perusahaan: penghapusan kontak dan perusahaan harus memperhitungkan penawaran dengan cara yang sama seperti invoice dan PO memperhitungkannya.

## Diserahkan ke builder

- Skema tabel: satu baris per versi (mis. `quotations` dengan `base_no`, `revision`, `root_id` atau sejenisnya, plus `quotation_lines`) atau bentuk lain, selama nomor dan riwayat di atas terpenuhi dan dijaga oleh constraint unik.
- Kolom persetujuan (mis. `approved_at`, `approved_by`).
- Default tanggal berlaku sampai di form: kosong (keputusan saya; pengguna mengisi sendiri bila perlu).
- Kode error dan pesan untuk penolakan perubahan kontak dan aksi pada versi terkunci, mengikuti pola `ApiError` yang ada.
- Tata letak riwayat revisi dan tombol di halaman detail, label dan warna status, filter status di daftar.
- Ikon menu dan breadcrumb.
