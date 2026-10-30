# Piutang (AR) dan Hutang (AP) — Desain

Tanggal: 2026-10-31

## Maksud dan alasan

Jurnalku punya Invoice dan Purchase Order (PO), tetapi tidak ada tempat untuk melihat
berapa uang yang masih harus diterima (piutang / AR) dan berapa yang masih harus dibayar
(hutang / AP). Pemilik ingin satu halaman yang menampilkan total AR, total AP, dan balance
perusahaan saat ini, dengan CRUD sederhana untuk mencatat AR dan AP.

Ini fitur pencatatan. Ia bukan akuntansi: tidak membuat jurnal dan tidak mengubah balance.

## Tujuan

- CRUD untuk AR dan AP.
- Satu halaman ringkasan: total AR belum lunas, total AP belum lunas, balance perusahaan.
- AR bisa dipecah menjadi termin yang dibuat di awal; tiap termin punya status lunas sendiri.
- AR terhubung ke Invoice, AP terhubung ke PO, dengan tombol pintas ke dokumen tersebut.

## Bukan tujuan

- Tidak ada tanggal jatuh tempo, aging report, atau pengingat.
- Tidak ada jurnal otomatis dan tidak ada efek ke CoA, buku besar, atau laporan keuangan.
- Tidak ada pembayaran parsial di dalam satu termin. Termin hanya lunas atau belum lunas.
- Menandai termin lunas tidak mengubah balance perusahaan.
- AR tidak bisa dibuat dari halaman Invoice (dan AP tidak dari halaman PO). Hubungan
  hanya dibuat dari sisi AR/AP.

## Anti-tujuan (dianggap gagal walau berfungsi)

- Menghapus AR/AP ikut menghapus Invoice atau PO.
- Balance perusahaan dihitung dari status termin sehingga berbeda dengan angka di dashboard.

## Keputusan pemilik

- Satu AR/AP punya: **judul** (contoh "Pembayaran Project A"), **pihak**, **total**,
  dan termin opsional.
- Termin dibuat di awal. Contoh: Project A Rp 100 jt, 3 termin: DP 30% lunas,
  Phase 2 40% belum lunas, Phase 3 30% belum lunas.
- Status lunas diatur manual per termin dan bisa dibalik (lunas ↔ belum lunas).
- Status AR/AP secara keseluruhan dihitung dari termin. Tanpa termin, status adalah satu
  toggle di AR/AP itu sendiri.
- Tiap termin punya Invoice sendiri. AR tanpa termin punya paling banyak satu Invoice.
- Saat membuat/mengubah AR, pengguna bisa **memilih invoice yang sudah ada** (invoice sering
  dibuat lebih dulu, jadi ada invoice tanpa AR). Daftar pilihan hanya berisi invoice yang
  belum terhubung ke AR.
- Di daftar AR tampil nomor invoice. Di tiap baris termin (atau di AR tanpa termin) ada
  tombol **Buat Invoice** bila belum ada invoice, atau **Detail Invoice** bila sudah ada.
- AP identik dengan AR, tetapi terhubung ke Purchase Order, dengan tombol Buat PO / Detail PO.
- Balance perusahaan **tidak** dipengaruhi AR/AP; dihitung dari sumber yang sudah ada.
- Menghapus AR/AP tidak menyentuh Invoice atau PO. Invoice/PO hanya dihapus dari menu masing-masing.
- **Mata uang**: IDR dan USD. Tiap AR/AP punya satu mata uang. Kartu total dipisah per mata
  uang, tidak ada konversi kurs.
- **Beda mata uang dengan invoice/PO**: hanya peringatan; tetap boleh dipilih dan disimpan.
- **Angka turunan**: kartu ringkasan menampilkan juga posisi bersih = balance + AR − AP.

## Keputusan saya (belum ditinjau pemilik)

- **Balance perusahaan**: memakai angka saldo rekening bank yang sama dengan kartu di dashboard
  (`reports/dashboard.ts`, field `bank`), bukan perhitungan baru.
- **Pihak**: dipilih dari menu Kontak yang ada. AR menawarkan kontak CUSTOMER dan BOTH;
  AP menawarkan VENDOR dan BOTH.
- **Letak di navigasi**: grup Invoicing, menu baru "Piutang & Hutang" dengan tab AR | AP;
  kartu ringkasan di atas kedua tab.
- **Validasi termin**: jumlah nominal termin harus sama dengan total. Termin boleh diisi
  dengan persen atau nominal; yang lain dihitung otomatis dari total.
- **Invoice dipilih**: jika invoice dipilih untuk AR tanpa termin dan total AR kosong, total
  dan mata uang terisi dari invoice. Pengguna tetap bisa mengubahnya.
- **Posisi bersih per mata uang**: balance bank dalam IDR, jadi untuk IDR posisi bersih =
  balance + AR IDR − AP IDR. Untuk USD tidak ada balance, jadi posisi bersih USD = AR USD −
  AP USD saja, dengan label yang menjelaskan bahwa balance tidak termasuk.
- **Peringatan beda mata uang**: tampil di form saat invoice/PO dipilih dan sebagai ikon di
  daftar/detail. Tidak memblokir simpan.
- **Tombol Buat Invoice**: membuka form invoice baru dengan kontak dan nominal terisi dari
  AR/termin. Setelah invoice tersimpan, ia otomatis terhubung ke AR/termin asal.
- **Invoice yang dihapus**: bila invoice terhubung dihapus dari menu Invoice, hubungan
  dianggap kosong (tombol kembali menjadi Buat Invoice, bisa dipilih ulang).
- **Satu invoice, satu tautan**: sebuah invoice hanya boleh terhubung ke satu AR atau termin
  aktif. Berlaku sama untuk PO dan AP.
- **Peran**: mengikuti aturan menu Invoicing yang ada (lihat/ubah sesuai peran).
- **Soft delete**: AR/AP yang dihapus memakai `deletedAt`, mengikuti pola invoice.

- **Status turunan**: tiga nilai tampilan: Belum lunas (tidak ada termin lunas), Sebagian
  (sebagian lunas), Lunas (semua lunas). Daftar bisa difilter menurut status ini.
- **"Total belum lunas" di kartu**: jumlah nominal termin yang belum lunas (atau total AR/AP
  bila tanpa termin dan belum lunas), bukan total penuh.
- **Sumber kebenaran nominal**: nominal AR/AP dan termin. Total invoice/PO terhubung boleh
  berbeda dan tidak mengubah nominal AR/AP.
- **Edit termin**: termin boleh ditambah, dihapus, dan dibagi ulang setelah dibuat, selama
  jumlahnya tetap sama dengan total. Menghapus termin melepas tautan invoice/PO-nya, tanpa
  menyentuh dokumennya. AR/AP boleh beralih antara bertermin dan tanpa termin; saat beralih
  ke tanpa termin, status menjadi Lunas hanya bila semua termin sebelumnya lunas.
- **Pembulatan**: termin terakhir menyerap sisa pembulatan supaya jumlah termin = total.
- **Data**: termin disimpan di tabel terpisah. "Satu invoice/PO, satu tautan" dijaga di
  database dengan unique index, dan menghapus (soft delete) AR/AP melepas semua tautannya.
- **Buat Invoice/PO**: form invoice/PO membawa asal AR/termin lewat query parameter. Tautan
  dibuat di server saat invoice/PO tersimpan, apa pun perubahan kontak atau nominal pada
  form. Form yang ditinggalkan tidak membuat tautan. Perubahan di modul Invoice/PO dibatasi
  pada menerima parameter itu dan membuat tautan.
- **Invoice/PO yang bisa dipilih**: yang belum dihapus dan belum terhubung. Tidak ada
  syarat kontak harus sama.
- **Hak akses**: AR dan AP sama-sama mengikuti peran menu Invoicing (lihat: viewer;
  ubah: peran yang boleh mengubah invoice), termasuk AP.

## Diserahkan ke pembangun

- Nama tabel dan kolom, migrasi, struktur route/API, dan komponen UI, mengikuti pola
  modul Invoicing yang ada.
- Tampilan kolom invoice di daftar AR untuk AR bertermin (usulan: "2 dari 3 invoice").
- Format penomoran AR/AP bila diperlukan.
- Pengujian: ikuti konvensi tes yang ada (unit untuk skema, integrasi untuk CRUD).
