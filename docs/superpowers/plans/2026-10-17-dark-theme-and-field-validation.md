# Tema Gelap + Validasi Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tema Gelap (default) / Terang / Sistem dengan tombol ganti, dan pesan validasi per field di bawah input, baik dari client maupun server, di semua form.

**Architecture:**
- Error API mendapat `error.fields` (tambahan yang tetap kompatibel) dari `ZodError` dan `ApiError(…, { field })`.
- Schema form dipindah ke `src/lib/schemas/` yang aman untuk client, dengan pesan Indonesia. Server dan client memakai schema yang sama, dan helper `fieldErrors()` memetakan issue ke field.
- Komponen `FormField` menampilkan pesan error.
- Tema berupa blok `.dark` di `app.css`, dipasang lewat class pada `<html>` oleh skrip inline di `app.html` dan disimpan di `localStorage['jk-theme']`.

**Tech Stack:** SvelteKit + Svelte 5, Tailwind v4 (`@custom-variant dark`), shadcn-svelte, Zod 4, bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-dark-theme-and-field-validation-design.md`. Mockup: `.superpowers/brainstorm/63105-1792222883/content/dark-theme.html`.

## Global Constraints

- **Palet gelap:**
  - background `#0E130F`, card `#151C16`, surface-2 `#1B241C`, border/input `#263127`
  - foreground `#E7EFE4`, muted-foreground `#8D9A8F`
  - lime `#C0F497` (teks di atasnya `#14210F`), green `#8FD463`, pale `rgba(192,244,151,0.10)`, destructive `#FF8A6B`
  - kartu bank `#1C2A1A → #243A1F` dengan border `#2F4A28`
- **Tema:** key localStorage `jk-theme` dengan nilai `dark|light|system`. Default `dark` (juga kalau localStorage error).
- **Teks e2e yang tidak boleh berubah:** label `Email`/`Password`; tombol `Masuk`, `Unggah`, `Konfirmasi semua saran…`, `Generate Jurnal`; teks `Perlu review`, `Tidak ada transaksi yang menunggu konfirmasi.`, `N jurnal dibuat`; badge `Balance` (exact); `Menu profil`, `Buka menu`, `Perusahaan baru`, `Pilih foto profil`.
- **Response error lama tetap ada**, berupa `{ error: { code, message, details? } }`. `fields` hanya tambahan.
- **Pesan "Email atau password salah"** tetap error umum, bukan error field.
- **Bebas warna hardcoded:** tidak ada `bg-white` atau kelas arbitrary berisi `#hex` di `src/routes` dan `src/lib/components` (kecuali `ui/`).

## Review Focus

- **Dropdown native (`<select>`/`<option>`) dan input tanggal di tema gelap:** teks harus terbaca. Cara: `color-scheme: dark` dan latar dari token. Dicek visual di Task 6.
- **Kedipan putih** saat reload halaman berat di tema gelap: skrip harus berjalan sebelum CSS digambar. Dites e2e di Task 6 dengan memeriksa class `dark` di `<html>` pada respons HTML awal (tanpa JS) lewat atribut yang dipasang skrip sebelum hydrate.
- **Form yang dikirim dengan Enter ketika ada field yang belum disentuh:** semua field harus divalidasi saat submit, bukan hanya yang sudah di-blur. Dites di Task 3.
- **Error server yang berganti setelah user mengetik:** error field dari server harus hilang saat isi field tersebut diubah. Dites di Task 3.
- **Viewer (read-only) dan halaman tanpa form:** tidak ada perubahan perilaku. Dicakup suite yang ada.

---

### Task 1: Kontrak error per field (server + client)

**Files:**
- Modify: `app/src/lib/server/api.ts`, `app/src/lib/api-client.ts`
- Modify (tambahkan `field`):
  - `app/src/lib/server/accounts/service.ts` (`duplicate_code` → `code`, `invalid_parent` → `parentId`)
  - `app/src/lib/server/rules/service.ts` (`invalid_keyword` dan `duplicate_rule` → `keyword`)
  - `app/src/lib/server/users/service.ts` (`already_member` → `email`; `password_required` → `password`)
  - `app/src/lib/server/company/service.ts` (`invalid_bank_account` → `bankAccountId`)
  - `app/src/lib/server/journal/opening.ts` (`empty_opening` → `lines`)
  - `app/src/lib/server/users/avatar.ts` (`invalid_image`/`image_too_large` → `file`)
- Test: `app/tests/integration/api-errors.test.ts`, `app/tests/unit/api-client.test.ts`

**Interfaces:**
- Produces:
  - `new ApiError(status, code, message, details?, opts?: { field?: string })`, dengan `ApiError.field?: string`.
  - JSON: `error.fields?: Record<string, string>`.
    - `ZodError` → `{ [String(issue.path[0] ?? '_')]: issue.message }`, memakai issue pertama per field.
    - `ApiError` dengan `field` → `{ [field]: message }`.
  - `ClientApiError.fields: Record<string, string>` (default `{}`).

- [ ] **Step 1: Test yang gagal.**
  - `api-errors.test.ts`:
    - POST `/api/accounts` dengan kode duplikat → `body.error.fields` sama dengan `{ code: 'Kode akun 1-1001 sudah dipakai' }`.
    - POST `/api/accounts` dengan body `{}` → `status 400`, dan `body.error.fields` punya key `code`, `name`, `parentId`.
    - POST `/api/rules` dengan keyword `'ab'` → `fields.keyword`.
  - `api-client.test.ts`: `apiFetch` atas respons `{error:{code:'x',message:'m',fields:{code:'c'}}}` melempar `ClientApiError` dengan `.fields` sama dengan `{code:'c'}`.
- [ ] **Step 2:** Jalankan `cd app && bun test tests/integration/api-errors.test.ts tests/unit/api-client.test.ts`. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasi di `api.ts` dan `api-client.ts`, lalu tambahkan `{ field }` pada ApiError yang tercantum di atas.
- [ ] **Step 4:** Jalankan test yang sama, lalu `bun run test`. Semua harus PASS.
- [ ] **Step 5:** Commit dengan `feat(app): per-field error contract for API responses`.

### Task 2: Schema bersama dengan pesan Indonesia + `fieldErrors`

**Files:**
- Create: `app/src/lib/schemas/{account,rule,member,company,profile,opening,login}.ts`, `app/src/lib/forms/validation.ts`
- Modify: service server yang memakai schema tersebut (import dari `$lib/schemas/*`; nama export lama tetap di-re-export dari service agar import lain tidak rusak)
- Test: `app/tests/unit/schemas.test.ts`

**Interfaces:**
- Produces:
  - `fieldErrors(schema: z.ZodType, values: unknown): Record<string, string>`. Hasilnya `{}` kalau valid, dengan issue pertama per field berdasarkan `path[0]`.
  - Schema berikut, dengan aturan yang **sama persis** dengan yang ada sekarang dan pesan Indonesia:
    - `CreateAccountInput`
    - `CreateRuleInput`: tambahkan `.refine` minimal 3 karakter setelah trim, dengan pesan `'Keyword rule minimal 3 karakter'`
    - `AddMemberInput`
    - `CompanyFields` / `CreateCompanyInput` / `UpdateCompanyInput`
    - `UpdateProfileInput`
    - `OpeningInput`
    - `LoginInput` (`email` wajib dan format email; `password` wajib)
  - Pesan wajib:
    - field kosong → `'<Label> wajib diisi'` / `'<Label> wajib dipilih'`
    - email → `'Format email tidak valid'`
    - password baru → `'Password minimal 8 karakter'`
    - kode akun → `'Kode hanya boleh angka dan tanda hubung, mis. 1-1008'` (regex `/^[0-9]+(-[0-9]+)*$/`)

    > **Ruling diperlukan:** regex kode akun ini aturan baru. Cek dulu bahwa semua kode di kedua template CoA (`coa-data.ts`, `coa-it.ts`) dan data dev lolos. Kalau ada yang tidak lolos, jangan tambahkan regex.

- [ ] **Step 1: Test yang gagal** di `schemas.test.ts`:
  - `fieldErrors(CreateAccountInput, {})` menghasilkan `code`, `name`, dan `parentId` dengan pesan Indonesia (tidak mengandung `'Too'` maupun `'Invalid'`).
  - `fieldErrors(LoginInput, { email: 'x', password: '' })` sama dengan `{ email: 'Format email tidak valid', password: 'Password wajib diisi' }`.
  - `fieldErrors(CreateRuleInput, { keyword: ' ab ', accountId: <uuid> })` mengandung `keyword`.
  - Semua kode CoA di kedua template lolos `CreateAccountInput.shape.code`.
  - Input valid menghasilkan `{}`.
- [ ] **Step 2:** Jalankan `bun test tests/unit/schemas.test.ts`. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Pindahkan schema, tambahkan pesan, dan buat `fieldErrors`. Server meng-import dari `$lib/schemas`.
- [ ] **Step 4:** Jalankan `bun run test && bun run check`. Harus PASS.
- [ ] **Step 5:** Commit dengan `refactor(app): shared form schemas with Indonesian validation messages`.

### Task 3: `FormField` + state form, dipakai di form Tambah Akun dan dialog Akun Baru

**Files:**
- Create: `app/src/lib/components/FormField.svelte`, `app/src/lib/forms/form-state.svelte.ts`
- Modify: `app/src/routes/(app)/settings/accounts/+page.svelte`, `app/src/lib/components/NewAccountDialog.svelte`
- Test: `app/tests/e2e/validation.spec.ts`

**Interfaces:**
- Produces:
  - `createFormState<T>(schema, initial: T)` → `{ values: T; errors: Record<string,string>; touch(field): void; validateAll(): boolean; setServerErrors(fields): void; clearServerError(field): void; error(field): string | undefined }`. Ini berupa Svelte 5 `$state`.
  - Aturan tampil: error field ditampilkan setelah field di-blur atau setelah submit pertama. Setelah tampil, error dihitung ulang setiap kali mengetik. Error server untuk sebuah field dihapus saat nilai field itu berubah.
  - `<FormField id label error hint? children>` merender label, children (input), dan `<p id="{id}-error" role="alert" class="text-destructive text-xs">` kalau ada error. Children menerima props `aria-invalid` dan `aria-describedby` lewat snippet param `{ invalid, describedBy }`.

- [ ] **Step 1: Test e2e yang gagal** di `validation.spec.ts` (login admin, buka `/settings/accounts`):
  - Klik **Tambah** dengan form kosong. Di bawah field Akun induk, Kode, dan Nama muncul pesan (`getByText('Kode wajib diisi')` terlihat). Input Kode punya `aria-invalid="true"`.
  - Isi Kode `1-1001` (sudah ada), Nama, dan Akun induk, lalu Tambah. `getByText('Kode akun 1-1001 sudah dipakai')` terlihat, dan pesan itu adalah `#…-error` milik field Kode.
  - Ubah Kode, dan pesan server itu hilang.
- [ ] **Step 2:** Jalankan `bunx playwright test tests/e2e/validation.spec.ts`. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasi helper + komponen, lalu pasang di kedua form. Error non-field tetap di Alert atas.
- [ ] **Step 4:** Jalankan `bunx playwright test tests/e2e/validation.spec.ts && bun run check`. Harus PASS.
- [ ] **Step 5:** Commit dengan `feat(app): inline field validation component, applied to account forms`.

### Task 4: Validasi field di form lainnya

**Files:**
- Modify:
  - `app/src/routes/login/{+page.svelte,+page.server.ts}`
  - `app/src/routes/(app)/profile/+page.svelte`
  - `app/src/routes/(app)/settings/{company,users,rules,opening-balance}/+page.svelte`
  - `app/src/routes/(app)/uploads/new/+page.svelte`
- Test: `app/tests/integration/login-action.test.ts` (kalau sudah ada pola test action; kalau tidak, tambahkan ke `validation.spec.ts`)

**Interfaces:**
- Consumes: Task 1–3.
- Produces: action login mengembalikan `fail(400, { email, fieldErrors: Record<'email'|'password', string> })` untuk input kosong/format salah, tanpa menyentuh throttle. Kalau kredensial salah, responsnya tetap `message`.

- [ ] **Step 1: Test yang gagal:**
  - e2e: login dengan email kosong → `getByText('Email wajib diisi')` di bawah field Email.
  - e2e: halaman Rule dengan keyword `ab` → `getByText('Keyword rule minimal 3 karakter')` di bawah field Keyword.
  - e2e: Profil dengan nama dikosongkan lalu Simpan → `getByText('Nama wajib diisi')`.
- [ ] **Step 2:** Jalankan test tersebut. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Pasang `createFormState` + `FormField` di setiap form:
  - **Saldo awal:** baris yang tidak seimbang ditandai, dan error `lines` tampil di bawah tabel.
  - **Upload:** pesan file ditampilkan di bawah dropzone (bukan Alert) untuk tipe/ukuran file, sedangkan error parser tetap di Alert.
- [ ] **Step 4:** Jalankan `bun run test && bunx playwright test`. Harus PASS.
- [ ] **Step 5:** Commit dengan `feat(app): inline field validation on all forms`.

### Task 5: Token tema gelap + hapus warna hardcoded

**Files:**
- Modify: `app/src/app.css`, dan file yang memakai `bg-white`/hex arbitrary (`+layout.svelte`, `AppSidebar.svelte`, `NextStepCard.svelte`, `ProfileMenu.svelte`, `dashboard/*.svelte`, `login/+page.svelte`, `uploads/new/+page.svelte`, `ui/button`, `ui/input`, `lib/ui.ts`)
- Test: `app/tests/unit/no-hardcoded-colors.test.ts`, `app/tests/unit/theme.test.ts`

**Interfaces:**
- Produces:
  - Token baru di `:root` dan `.dark`: `--surface-soft`, `--hero-bank-from/-to/-border`, `--hero-review-from/-to`, `--header-tint`, `--btn-primary-bg`, `--btn-primary-fg`.
  - Utilitas: `bg-surface-soft`.
  - `.dark` berisi palet gelap dari Global Constraints, dan `.dark { color-scheme: dark }`.

- [ ] **Step 1: Test yang gagal:**
  - `no-hardcoded-colors.test.ts` ditambah larangan `/\bbg-white\b/` dan `/-\[[^\]]*#[0-9a-f]{3,8}/i` (di luar `ui/`).
  - `theme.test.ts` memastikan blok `.dark` memuat `#0e130f`, `#151c16`, `#e7efe4`, `#8fd463`, `#ff8a6b`, dan `color-scheme: dark`.
- [ ] **Step 2:** Jalankan `bun test tests/unit`. Hasil yang diharapkan: FAIL, dengan daftar file yang melanggar.
- [ ] **Step 3:** Tulis token dan ganti kelas di file-file tersebut. Tombol `default` memakai `--btn-primary-*` (gradien hijau di tema terang, lime solid di tema gelap).
- [ ] **Step 4:** Jalankan `bun test tests/unit && bun run check`. Harus PASS.
- [ ] **Step 5:** Commit dengan `feat(app): dark theme tokens; remove hardcoded colors`.

### Task 6: Tombol tema + skrip anti-kedip

**Files:**
- Create: `app/src/lib/theme.ts` (`THEME_KEY`, `type ThemeMode`, `applyTheme(mode)`, `readTheme()`), `app/src/lib/components/ThemeToggle.svelte`
- Modify: `app/src/app.html` (skrip inline di `<head>`), `app/src/routes/(app)/+layout.svelte` (top bar), `app/src/routes/login/+page.svelte` (ikon di pojok)
- Test: `app/tests/e2e/theme.spec.ts`

**Interfaces:**
- Produces:
  - `applyTheme(mode)` memasang/menghapus class `dark` dan `style.colorScheme` di `document.documentElement`, menyimpan ke localStorage (dengan try/catch), dan untuk `system` mendengarkan `matchMedia('(prefers-color-scheme: dark)')`.
  - Toggle: segmented control `role="radiogroup"` `aria-label="Tema"` dengan tiga `role="radio"` (Terang, Gelap, Sistem). Di bawah `sm` berupa satu tombol `aria-label="Tema: Gelap. Ganti tema"`.

- [ ] **Step 1: Test e2e yang gagal** di `theme.spec.ts`:
  - Context baru → buka `/login` → `<html>` punya class `dark`.
  - Login, pilih radio "Terang" → class `dark` hilang. Reload → tetap terang. Pilih "Sistem" dengan `colorScheme: 'light'` dari Playwright → terang; emulasi `dark` → gelap.
  - Script inline: `page.route` memblokir semua `/_app/**` JS lalu memuat `/login` → `<html>` tetap punya class `dark`. Ini membuktikan tema dipasang sebelum hydrate.
- [ ] **Step 2:** Jalankan `bunx playwright test tests/e2e/theme.spec.ts`. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasi. Skrip di `app.html` disalin minimal (≤ 12 baris) dan logikanya identik dengan `applyTheme`.
- [ ] **Step 4:** Jalankan `bunx playwright test && bun run check`. Harus PASS.
- [ ] **Step 5:** Commit dengan `feat(app): theme toggle (dark default) with no-flash boot script`.

### Task 7: Verifikasi menyeluruh

- [ ] **Step 1:** Jalankan `cd app && bun run test && bun run check && bun run build && bunx playwright test`. Semua harus PASS.
- [ ] **Step 2:** Cek visual di Chrome pada kedua tema, desktop dan 390px: `/login`, `/dashboard`, `/review`, `/balance-sheet`, `/settings/accounts` (dengan error field tampil), `/profile`. Periksa dropdown native, input tanggal, kontras teks pada kartu lime, dan badge.
- [ ] **Step 3:** Commit perbaikan yang ditemukan dengan `fix(app): theme/validation polish from visual check`.
