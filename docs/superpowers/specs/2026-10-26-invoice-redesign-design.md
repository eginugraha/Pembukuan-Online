# Desain ulang invoice (tampilan + data + penomoran)

Tanggal: 2026-10-26

## Maksud

PDF invoice sekarang hanya berupa kop surat laporan + tabel polos. Pemilik produk ingin invoice yang bisa langsung dikirim ke klien. Gaya dan format meniru invoice-2 (kuitansi Treasury). Kelengkapan datanya meniru invoice-1 (invoice Ekuator). Kedua file contoh ada di root repo dan di-gitignore.

Tampilannya sudah disetujui lewat mockup HTML (revisi 9): `docs/superpowers/specs/assets/2026-10-26-invoice-mockup.html`. Mockup memakai `watermark.png` dari root repo (tidak di-commit). Isi mockup adalah contoh data Ekuator, bukan data tetap.

Pekerjaan ini menyesuaikan alur **buat/ubah invoice** (form, data, penomoran) dan **PDF invoice** supaya menghasilkan dokumen seperti mockup.

## Tujuan

1. PDF invoice mengikuti tata letak mockup. Urutan dari atas:
   - **Kiri atas:** logo + nama perusahaan, alamat, email perusahaan (ikon amplop), telepon perusahaan (ikon telepon). Email dan telepon bisa diklik (`mailto:` / `tel:`) dan tidak bergaris bawah.
   - **Kanan atas:** judul "INVOICE" dengan subjudul miring "Tagihan". Di bawahnya label dwibahasa "Nomor Invoice / Invoice Number", "Tanggal / Issue Date", dan "Jatuh Tempo / Due Date" (jatuh tempo hanya bila diisi).
   - **Baris kedua:** di kiri label "PERIHAL / SUBJECT" + teks perihal; di kanan label "DITAGIHKAN KEPADA / BILL TO" + nama kontak, "Attn: <attention>[, <position>]", alamat, email kontak, telepon kontak (email dan telepon bisa diklik lewat `mailto:`/`tel:`, tanpa garis bawah), lalu "NPWP <npwp>". Baris yang datanya kosong dilewati.
   - **"RINCIAN TAGIHAN / Billing Summary":** tabel dengan kolom Keterangan/Description, Jumlah/Quantity (ditulis `x<qty>`), Harga (Rp)/Price (Rp), dan Jumlah Harga (Rp)/Total Price (Rp). Teks kolom pertama rata dengan tepi kiri konten dan kolom terakhir rata dengan tepi kanan konten, tanpa padding. Baris Total dicetak tebal.
   - **"TERBILANG / Amount in Words":** total ditulis dalam kata Bahasa Indonesia, misalnya "Sepuluh Juta Rupiah".
   - **Kartu "INFORMASI PEMBAYARAN / Payment Information":** latar terang, bergaris tepi, sudut membulat. Isinya `<Nama bank> <No. rekening>`, `a.n. <Nama pemilik rekening>`, dan `SWIFT <kode>`.
   - **Catatan invoice** (`notes`, teks bebas per invoice). Bagian ini menggantikan paragraf "Pertanyaan terkait invoice" di contoh.
   - **Kanan bawah:** "Approved by,", gambar tanda tangan, nama penanda tangan, dan jabatan.
   - **Watermark:** gambar perusahaan, pudar, di kanan bawah halaman di belakang konten. Posisi relatifnya seperti mockup (`right:-40px; bottom:140px; width:500px` pada kertas 640px, opacity .75).
2. Data baru:
   - **Perusahaan** (Pengaturan Perusahaan): kode perusahaan, email, telepon, nama bank, nomor rekening, nama pemilik rekening, kode SWIFT, nama penanda tangan, jabatan penanda tangan, gambar tanda tangan, dan gambar watermark.
   - **Kontak:** kode kontak.
   - **Invoice:** perihal (diisi per invoice di form buat/ubah).
3. Format nomor dokumen baru: `NNN/<KODEPERUSAHAAN>-<KODEKONTAK>/<JENIS>/<BULAN-ROMAWI>/<TAHUN>`. Contoh: `001/SET-XFORMATION/INV/IV/2026`.
   - `NNN`: nomor urut, minimal 3 digit (`001`). Bila lewat 999, nomor bertambah digit secara alami (`1000`).
   - Urutan dihitung **per perusahaan, per jenis, per tahun**. Urutan tidak dihitung per kontak dan tidak kembali ke 001 setiap bulan. Bulan hanya label.
   - Format baru **mulai lagi dari 001**, terpisah dari urutan format lama. Contohnya, kalau 2026 sudah ada `INV-2026-0005`, invoice format baru pertama tetap `001/…/INV/…/2026`. Urutan lama tidak dilanjutkan, dan counter lama tidak dihapus. Caranya (kunci counter baru atau penanda format) diserahkan ke pembangun.
   - `JENIS` = `INV` untuk invoice, `PO` untuk purchase order. PO memakai pola yang sama.
   - Bulan (Romawi I–XII) dan tahun diambil dari tanggal dokumen.
   - Nomor ditetapkan sekali saat dibuat dan **tidak pernah berubah**, walaupun kode perusahaan/kontak atau tanggal diubah kemudian. Dokumen lama tetap memakai nomor format lama (`INV-2026-0001`).
   - Membuat invoice/PO **wajib** sudah ada kode perusahaan dan kode kontak. Bila belum ada, server menolak dengan pesan yang jelas, dan form memberi tahu sebelum disimpan.

## Bukan tujuan

- Baris "Gratis" (harga 0). Potongan cukup lewat diskon. Validasi baris tetap qty > 0 dan harga > 0.
- Beberapa baris berbagi satu sel harga (rowspan di invoice-1). Setiap baris punya qty × harga sendiri.
- Mengubah tata letak PDF purchase order. PO hanya ikut format nomor baru.
- Mengubah nomor dokumen yang sudah terbit.
- Multi-rekening atau rekening per invoice. Satu set info pembayaran per perusahaan.
- Penanda tangan per invoice. Satu penanda tangan per perusahaan.
- Bahasa invoice yang bisa dipilih. Label selalu dwibahasa seperti mockup.
- Stempel "LUNAS" di tengah halaman. Stempel ini sudah dicoba di mockup dan disukai, tetapi disimpan untuk dokumen **advance receipt** di fitur berikutnya, bukan untuk invoice ini.

## Anti-tujuan (gagal walaupun "jalan")

- Invoice yang tidak bisa dipakai ke klien: logo/watermark menutupi angka di tabel, teks terpotong, atau total tidak terbaca.
- Watermark Ekuator (atau data Ekuator lain dari mockup) ikut ter-hardcode ke semua perusahaan.
- Dua invoice mendapat nomor yang sama, atau nomor berubah setelah terbit.
- Tanda tangan/watermark kehilangan transparansi (latar putih kotak) di PDF.

## Perilaku bila data opsional kosong

Semua field baru perusahaan bersifat opsional kecuali kode (wajib untuk membuat dokumen). PDF tetap rapi bila data kosong:

- Email/telepon perusahaan kosong: baris tersebut beserta ikonnya tidak dicetak.
- Perihal kosong: blok "PERIHAL / SUBJECT" tidak dicetak, dan blok "BILL TO" tetap di posisinya.
- Info bank kosong (tidak ada nama bank maupun nomor rekening): kartu pembayaran tidak dicetak. SWIFT atau nama pemilik yang kosong cukup dilewati barisnya.
- Catatan kosong: tidak dicetak.
- Tidak ada gambar tanda tangan: sisakan ruang kosong setinggi tanda tangan untuk tanda tangan basah. Tidak ada nama dan jabatan penanda tangan: seluruh blok "Approved by" tidak dicetak.
- Tidak ada watermark: tidak ada watermark.
- Diskon atau PPN > 0: sebelum baris Total tambahkan baris Subtotal, Diskon (nilai negatif), dan PPN (x%). Labelnya dwibahasa: "Subtotal", "Diskon / Discount", "PPN / VAT (x%)". Bila keduanya 0, hanya baris Total yang dicetak, seperti di mockup.

## Batasan

- Stack yang ada: SvelteKit 2 + Svelte 5, Drizzle/Postgres (migrasi di `app/drizzle/migrations`), zod 4, pdfkit 0.20.2, bun test, dan Playwright.
- PDF tetap dibuat dengan pdfkit di server (`app/src/lib/server/invoicing/pdf.ts` dan rute `app/src/routes/api/invoicing/invoices/[id]/pdf/+server.ts`). Tidak ada headless browser.
- Gambar perusahaan disimpan di DB (bytea) dengan pola seperti logo (`company_logos`, `app/src/lib/server/company/logo.ts`): validasi magic bytes, batas ukuran, dan URL ber-versi. Logo yang ada tidak diubah.
- Kode perusahaan dan kode kontak: huruf besar A–Z dan angka 0–9, panjang 1–15. Input dinormalisasi ke huruf besar. Tanda hubung tidak diizinkan karena dipakai sebagai pemisah di nomor.
- Kolom `invoices.invoice_no` dan `purchase_orders.po_no` (sekarang varchar 30) diperlebar agar muat nomor terpanjang (≈ 4+1+15+1+15+1+3+1+4+1+4 = 50).
- Hak akses mengikuti yang ada: field perusahaan baru diedit oleh peran yang sekarang boleh mengedit Pengaturan Perusahaan, dan kode kontak oleh peran yang boleh mengedit kontak.
- Teks UI dalam Bahasa Indonesia, mengikuti gaya form yang ada (`DocumentForm.svelte`, halaman Pengaturan Perusahaan, form Kontak).

## Keputusan yang diambil pemilik produk

- Gaya invoice-2, kelengkapan data invoice-1. Mockup revisi 9 disetujui apa adanya.
- Info pembayaran, penanda tangan, watermark, email, dan telepon perusahaan diset sekali di Pengaturan Perusahaan. Perihal diisi per invoice.
- Paragraf "pertanyaan terkait invoice" bukan teks tetap. Isinya diisi per invoice lewat catatan.
- Format nomor `001/SET-XFORMATION/INV/IV/2026` beserta aturan urutan di atas. Kode perusahaan ada di Pengaturan Perusahaan, kode pelanggan di Kontak.
- Tidak ada baris "Gratis".

## Keputusan saya (bisa dikoreksi)

- Satu baris dengan harga gabungan tidak didukung.
- Font PDF tetap Helvetica bawaan pdfkit, bukan Open Sans seperti di mockup, supaya tidak menambah file font. Ukuran, tebal, warna abu-abu, dan teks miring untuk label Inggris mengikuti mockup.
- Ikon amplop dan telepon digambar sebagai path vektor di pdfkit dari SVG mockup.
- Terbilang dihitung dari `total`. Bila ada sen bukan nol, tambahkan "… Rupiah <n> Sen". Huruf pertama kapital, contohnya "Sepuluh Juta Rupiah". Fungsinya murni dan diuji unit, termasuk 0, belasan, "seratus", "seribu", juta, miliar, dan triliun.
- Watermark dicetak di setiap halaman, di belakang konten. Blok tanda tangan hanya di halaman terakhir. Header kolom tabel diulang di halaman lanjutan, seperti sekarang.
- Perihal adalah kolom `invoices.subject`: opsional, maksimal 200 karakter, satu baris di form, dan teks dibungkus di PDF.
- Kode kontak tidak harus unik per perusahaan, karena nomor urut tidak bergantung pada kontak.
- Kode kontak adalah satu field untuk semua jenis kontak (pelanggan, pemasok, keduanya). Kode pemasok dipakai di nomor PO.
- Tidak ada backfill kode otomatis. Perusahaan dan kontak yang sudah ada tetap tanpa kode sampai diisi. Form buat invoice/PO memberi tahu kode yang kosong sebelum disimpan, dan seed e2e/fixture tes mengisi kode.
- Kode hanya wajib saat **membuat** dokumen. Mengubah invoice/PO (termasuk mengganti kontak atau tanggal) tidak memeriksa kode dan tidak mengubah nomor. Bulan/tahun di nomor boleh berbeda dari tanggal yang sudah diubah.
- Teks di luar karakter Latin (WinAnsi) tidak didukung oleh Helvetica. Ini diterima, sama seperti PDF lain di aplikasi.
- Paginasi: blok terbilang, kartu pembayaran, catatan, dan tanda tangan masing-masing tidak dipotong di tengah. Blok tanda tangan tidak boleh sendirian di halaman baru. Bila tidak muat, blok sebelumnya ikut pindah ke halaman berikutnya.
- Gambar tanda tangan dan watermark menerima PNG/WebP dengan transparansi, dibatasi ±512 KB. Tidak ada crop wajib seperti logo. Watermark dicetak dengan opacity tetap 0.75.
- Halaman detail invoice di aplikasi menampilkan perihal. Daftar invoice tetap seperti sekarang, hanya nomornya berformat baru.
- Field-field dwibahasa hanya ada di PDF. Form aplikasi tetap Bahasa Indonesia.

## Diserahkan ke pembangun

- Bentuk penyimpanan gambar tanda tangan dan watermark: dua tabel seperti `company_logos`, atau satu tabel `company_assets` dengan kolom `kind`.
- Tata letak bagian baru di halaman Pengaturan Perusahaan (dikelompokkan, misalnya "Kontak", "Info Pembayaran", "Tanda Tangan & Watermark").
- Cara form invoice memberi tahu kode yang kosong, misalnya peringatan di atas form dengan tautan ke Pengaturan Perusahaan atau ke kontak terpilih.
- Koordinat persis di PDF, asalkan hasilnya setia pada mockup dan anti-tujuan di atas.
- Penyesuaian tes yang memeriksa format nomor lama (`invoicing-numbering`, `invoicing-invoice-crud`, `invoicing-po-crud`, `invoicing-smoke`, dll.).
