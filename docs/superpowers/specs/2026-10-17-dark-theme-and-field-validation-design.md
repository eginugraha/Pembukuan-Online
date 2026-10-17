# Tema Gelap + Tombol Tema, dan Validasi Field — Desain

Tanggal: 2026-10-17 · Status: menunggu persetujuan

## Intent

Pemilik ingin dua hal:
1. **Tema gelap sebagai default**, dengan tombol untuk berganti tema.
2. **Validasi input yang jelas**: pesan error muncul **di bawah input** yang bermasalah, bukan hanya di kotak pesan di atas halaman.

Mockup yang disetujui pemilik ("ya seperti itu"): `.superpowers/brainstorm/63105-1792222883/content/dark-theme.html`.

## Goals

1. Tema **Gelap · Terang · Sistem**, dengan default **Gelap**.
   - Pilihan diingat per browser.
   - Pilihan diterapkan sebelum halaman pertama kali digambar, supaya tidak ada kedipan tema terang.
2. Semua halaman, termasuk login, nyaman dibaca di kedua tema.
3. Semua form menampilkan error **per field di bawah input**. Field yang error diberi garis merah dan diumumkan ke pembaca layar.
   - **Pengecekan di client:** saat field ditinggalkan (blur) dan saat submit. Setelah sebuah field sempat error, pengecekan ulang dilakukan setiap kali mengetik.
   - **Error dari server juga diarahkan ke field-nya**, misalnya "Kode akun 1-1001 sudah dipakai" di bawah kolom Kode. Error yang tidak terkait field tertentu tetap tampil di kotak pesan atas.
4. Pesan validasi dalam Bahasa Indonesia yang ramah. Pesan bawaan Zod berbahasa Inggris seperti "Too small" tidak boleh lagi muncul ke pengguna.

## Non-goals

- Mengubah alur, izin, atau aturan bisnis.
- Menyimpan pilihan tema di akun (database). Pilihan cukup disimpan per browser.
- Validasi untuk form filter tanggal laporan. Input tanggal bawaan browser sudah cukup.

## Anti-goals

- **Kedipan putih** saat memuat halaman di tema gelap.
- Teks atau angka yang **kontrasnya kurang** di salah satu tema, misalnya teks gelap di atas latar gelap. Ini termasuk dropdown native (`<select>`/`<option>`).
- **Aturan validasi client dan server yang berbeda**, misalnya client meloloskan input yang ditolak server dengan pesan lain.
- Menghilangkan kotak error umum. Error di luar field, seperti "Layanan parser tidak tersedia", tetap harus terlihat.

## Constraints

- Tetap memakai token CSS shadcn di `src/app.css`. Tema gelap ditulis sebagai blok `.dark { … }` (sekarang masih berisi nilai abu-abu bawaan shadcn) dan diaktifkan lewat class `dark` di `<html>`, sesuai `@custom-variant dark` yang sudah ada.
- Warna hardcoded di halaman dan komponen app harus diganti token:
  - `bg-white` (11×)
  - `bg-[#fbfcfb]` (3×)
  - gradien kartu dashboard, header, kartu "Langkah berikutnya", login, dan `ring-[#dcfac4]`

  Test `tests/unit/no-hardcoded-colors.test.ts` diperluas untuk melarang `bg-white` dan warna hex di kelas arbitrary pada file di luar `src/lib/components/ui`.
- Teks yang dipakai test e2e tidak berubah (label Email/Password, tombol Masuk/Unggah/…, "Perlu review", badge "Balance").
- Zod v4 sudah ada. Schema input sekarang berada di `src/lib/server/**`. Supaya aturannya tidak terduplikasi, schema yang dipakai form dipindah ke modul yang aman untuk client (`src/lib/schemas/`), lalu di-import oleh server dan client.

## Keputusan pemilik

- Ada tombol tema, default Gelap.
- Palet gelap dan perilaku validasi sesuai mockup dan usulan di chat.

## Palet gelap

| Token | Nilai |
|---|---|
| background | `#0E130F` |
| card / surface | `#151C16` |
| surface-2 (input, tile netral) | `#1B241C` |
| border / input | `#263127` |
| foreground (ink) | `#E7EFE4` |
| muted-foreground | `#8D9A8F` |
| lime (aksen, tombol utama, kartu rekening) | `#C0F497`, teks di atasnya `#14210F` |
| green (positif, indikator) | `#8FD463` |
| pale (latar menu aktif / hover) | `rgba(192,244,151,0.10)` |
| destructive (negatif / error) | `#FF8A6B` |

- Kartu saldo bank memakai gradien hijau gelap `#1C2A1A → #243A1F` dengan border `#2F4A28`.
- Kartu rekening tetap lime.
- **Tombol utama di tema gelap memakai lime solid dengan teks gelap**. Di tema terang tetap gradien hijau.

## Diputuskan Claude

- **Penyimpanan tema:** `localStorage` dengan key `jk-theme` (`dark`|`light`|`system`). Skrip inline kecil di `app.html` memasang class `dark` sebelum halaman digambar, dan mengatur `color-scheme` agar scrollbar dan kontrol native ikut gelap. Kalau localStorage tidak bisa diakses, dipakai default Gelap.
- **Letak tombol tema:** segmented control (☀ Terang · ☾ Gelap · ◐ Sistem) di top bar. Di bawah `sm` cukup satu tombol ikon yang berputar di antara ketiga mode, dengan `aria-label` yang menyebut mode saat ini. Di halaman login, tombolnya berupa ikon di pojok.
- **Pola validasi:**
  - Helper kecil yang aman untuk client, `$lib/forms/validation.ts`, dengan fungsi `fieldErrors(schema, values)` → `Record<string, string>`.
  - State per form: `touched`, `errors`, `submitted`.
  - Komponen `FormField.svelte` untuk label + input + pesan error, memakai `aria-invalid`, `aria-describedby`, dan `role="alert"` pada pesan.
- **Kontrak error server:**
  - Untuk `ZodError`, response mendapat tambahan `error.fields: Record<field, message>` dari `issue.path[0]` dan pesan schema.
  - `ApiError` mendapat parameter opsional `field`, yang dikirim sebagai `error.fields = { [field]: message }`. Contohnya `duplicate_code` → `code`, `duplicate_rule` → `keyword`, `already_member` → `email`, `invalid_bank_account` → `bankAccountId`, `invalid_keyword` → `keyword`.
  - `ClientApiError` mendapat `fields`.
  - **Format response lama tidak berubah**, jadi client lama tetap jalan.
- **Login (form action SvelteKit):** action mengembalikan `fieldErrors` untuk email kosong/tidak valid dan password kosong. Pesan "email atau password salah" tetap jadi error umum, demi keamanan.
- **Form yang dicakup:**
  - login
  - profil (nama)
  - perusahaan (data perusahaan dan perusahaan baru)
  - pengguna (tambah anggota)
  - bagan akun (tambah akun dan dialog akun baru di Review)
  - rule (tambah rule)
  - saldo awal (tanggal, dan baris yang tidak seimbang ditandai)
  - upload eStatement (pesan validasi file pindah ke bawah dropzone)

## Definisi selesai

- Default yang terlihat oleh pengguna baru adalah tema gelap, tanpa kedipan. Mengganti tema langsung berlaku di semua halaman dan tetap diingat setelah reload.
- Setiap form di atas menampilkan error di bawah field untuk input kosong/tidak valid (client) dan untuk konflik dari server.
- Test:
  - **Unit:** `fieldErrors` dan pesan Indonesia untuk setiap schema yang dipindah.
  - **Integrasi:** response API memuat `error.fields` untuk ZodError dan ApiError yang ber-field.
  - **E2E:** default gelap, pilihan tema tersimpan, error field muncul di bawah input di form tambah akun (client dan server).
- `bun run test`, `bun run check`, `bun run build`, dan e2e lulus. Cek visual kedua tema di desktop dan HP untuk dashboard, review, neraca, pengaturan, login, dan profil.
