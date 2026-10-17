# Ubah Akun Jurnal, Hapus Akun, Polesan UI, Temuan Minor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (dipilih pemilik: Native) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mengerjakan tujuh perubahan UI/fitur dari spec dan semua temuan minor dari tiga review terakhir.

**Architecture:** Dua service server baru dengan transaksi atomik (`journal/edit.ts`, `accounts/delete.ts`) dan endpoint API-nya, dialog UI yang memakai `SearchSelect`; polesan shell memakai komponen yang ada; minor dikelompokkan per area.

**Tech Stack:** SvelteKit/Svelte 5, Drizzle, bits-ui, bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-journal-edit-account-delete-polish-design.md`

## Global Constraints

- Peran: edit jurnal ≥ accountant, hapus akun = admin.
- Error API per field lewat `ApiError(..., { field })`.
- Teks e2e yang tidak boleh berubah: `Masuk`, `Unggah`, `Generate Jurnal`, `Perlu review`, `Tampilkan`, `Reset`, `Menu profil`, `Buka menu`, `Perusahaan baru`, `Akun induk`, `Akun tujuan`, `Keyword`, `Role`, `Kode`, `Nama`. Test yang memang terkait fitur yang diubah (radiogroup tema, tombol ciutkan di sidebar, Keluar) boleh disesuaikan.
- Commit diakhiri `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Tidak ada dependensi baru.

## Review Focus

- Edit jurnal: baris bank tidak boleh berubah; jurnal tetap seimbang; `transactions.account_id` sama dengan baris kategori; entry perusahaan lain tidak bisa diedit (404). Dites di Task 1.
- Hapus akun: gagal sebagian harus membatalkan semuanya (tidak ada akun terhapus tanpa data pindah, atau sebaliknya); akun bank/induk ditolak; target beda tipe/saldo normal ditolak; referensi `ai_suggested_account_id` ikut pindah. Dites di Task 2.
- Logout: dialog dibatalkan = tetap login. Dites di Task 3.
- Reset aktif hanya bila filter berbeda dari default; tanggal setengah mengetik memblokir submit. Dites di Task 4.

---

### Task 1: Ubah akun kategori di Jurnal Umum

**Files:** Create `app/src/lib/server/journal/edit.ts`, `app/src/routes/api/journal/[id]/account/+server.ts`, `app/src/lib/components/EditJournalAccountDialog.svelte`. Modify `app/src/lib/server/journal/queries.ts` (tambahkan `lineId`, `accountId`, `transactionId` pada baris dan `categoryLineId` pada entry), `app/src/routes/(app)/journal/+page.server.ts` (`canEdit`), `app/src/routes/(app)/journal/+page.svelte`, `app/tests/integration/rbac-matrix.test.ts`. Test: `app/tests/integration/journal-edit.test.ts`, `app/tests/e2e/journal-edit.spec.ts`.

**Interfaces:** `updateJournalAccount(companyId: string, userId: string, entryId: string, accountId: string): Promise<void>`. Endpoint `PATCH /api/journal/:id/account` `{ accountId }` → `{ ok: true }`.

- [ ] **Step 1: Test integrasi yang gagal:** setelah `generateJournal`, `updateJournalAccount` memindahkan baris kategori ke akun lain; baris bank tidak berubah; total debit = kredit; `transactions.account_id` dan `source = 'USER'` ikut; `getLedger` akun lama kosong dan akun baru berisi. Ditolak: akun bank (`bank_account_not_allowed`), akun induk/non-leaf (`invalid_account`), entry OPENING (409 `journal_not_editable`), entry perusahaan lain (404). Endpoint terdaftar di matriks RBAC (viewer ditolak, accountant boleh).
- [ ] **Step 2:** Jalankan `cd app && bun test tests/integration/journal-edit.test.ts`. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasi service (satu transaksi, kunci perusahaan), endpoint, dan perluasan `listJournal`.
- [ ] **Step 4:** Test e2e gagal lalu UI: ikon pensil (`aria-label="Ubah akun {kode}"`) pada baris kategori jurnal TRANSACTION saat `canEdit`; dialog `Ubah akun jurnal` dengan `SearchSelect`, tombol `Simpan`, error di bawah field. e2e: ubah akun sebuah jurnal lalu lihat baris baru di tabel.
- [ ] **Step 5:** Jalankan `bun run test && bunx playwright test && bun run check`. Harus PASS.
- [ ] **Step 6:** Commit `feat(app): edit the category account of a transaction journal entry`.

### Task 2: Hapus akun dengan pemindahan data

**Files:** Create `app/src/lib/server/accounts/delete.ts`, `app/src/routes/api/accounts/[id]/usage/+server.ts`, `app/src/routes/api/accounts/[id]/delete/+server.ts`, `app/src/lib/components/DeleteAccountDialog.svelte`. Modify `app/src/routes/(app)/settings/accounts/+page.svelte` dan `+page.server.ts` (kirim `bankAccountId`), `app/tests/integration/rbac-matrix.test.ts`. Test: `app/tests/integration/account-delete.test.ts`, `app/tests/e2e/account-delete.spec.ts`.

**Interfaces:**
- `getAccountUsage(companyId, accountId): Promise<{ journalLines: number; transactions: number; rules: number; children: number; isBankAccount: boolean }>`
- `deleteAccount(companyId, accountId, moveToId?: string): Promise<void>`

- [ ] **Step 1: Test integrasi yang gagal:**
  - akun kosong terhapus.
  - akun terpakai tanpa `moveToId` → `move_required` (field `moveToId`).
  - dengan target valid, semua `journal_lines`, `transactions.account_id`/`ai_suggested_account_id`, dan `category_rules` pindah dan akun terhapus; saldo buku besar target = saldo lama + saldo akun yang dihapus.
  - ditolak: akun bank, akun punya anak, target beda tipe, target beda saldo normal, target = akun itu sendiri, target akun bank, target nonaktif.
  - atomik: bila penghapusan gagal, pemindahan dibatalkan.
  - akun perusahaan lain → 404.
  - RBAC: hanya admin.
- [ ] **Step 2:** Jalankan `bun test tests/integration/account-delete.test.ts`. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasi service + dua endpoint.
- [ ] **Step 4:** Test e2e gagal lalu UI: tombol `Hapus` per akun; dialog `Hapus akun`, ringkasan penggunaan, `SearchSelect` "Pindahkan data ke…" (disaring: aktif, leaf, tipe & saldo normal sama, bukan diri sendiri, bukan akun bank), tombol `Hapus akun`. e2e: hapus akun kosong buatan test; hapus akun terpakai dengan memilih tujuan dan lihat data pindah.
- [ ] **Step 5:** Jalankan `bun run test && bunx playwright test && bun run check`. Harus PASS.
- [ ] **Step 6:** Commit `feat(app): delete accounts with data reassignment and confirmation`.

### Task 3: Polesan shell (toggle, profil, tema, logout) + minor terkait

**Files:** Modify `AppSidebar.svelte`, `(app)/+layout.svelte`, `ProfileMenu.svelte`, `app.html`, `app.css`, `lib/theme.ts`, `SimpleSelect.svelte` (snippet `display` opsional). Create `ThemeSelect.svelte`, `ConfirmLogoutDialog.svelte`, `SidebarToggle.svelte`. Delete `ThemeToggle.svelte`. Test: `e2e/theme.spec.ts`, `e2e/sidebar-collapse.spec.ts`, `e2e/fixed-chrome.spec.ts`, `e2e/shell.spec.ts`, `e2e/logout-confirm.spec.ts`, `tests/unit/theme.test.ts`.

- [ ] **Step 1: Test yang gagal / disesuaikan:**
  - tombol ciutkan ada di `banner` sebelum pemilih perusahaan dan tidak ada di sidebar.
  - tema: dropdown `Tema` dengan tiga pilihan, pilihan tersimpan, `<html data-theme>` terpasang sebelum JS aplikasi, nilai tersimpan tidak dikenal = dark (unit: logika `theme.ts` dan skrip inline sama).
  - tombol profil punya padding kiri ≥ 12px.
  - klik `Keluar` membuka dialog; `Batal` menutup dan tetap login; `Keluar` mengakhiri sesi.
  - item sidebar ciut: tidak ada `aria-describedby` ganda.
- [ ] **Step 2:** Jalankan test terkait. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasi:
  - `SidebarToggle` di top bar (ikon via CSS `sb-collapsed`, `aria-controls="app-sidebar"`; `id="app-sidebar"` pada aside).
  - `ThemeSelect` (trigger menampilkan ikon+label berdasarkan `data-theme`).
  - `app.html`/`theme.ts` menulis `data-theme` dan menormalkan nilai tak dikenal.
  - `ConfirmLogoutDialog`.
  - `pl-3` pada tombol profil.
  - tooltip sidebar tanpa `aria-describedby`.
- [ ] **Step 4:** Jalankan `bun run test && bunx playwright test && bun run check`. Harus PASS.
- [ ] **Step 5:** Commit `feat(app): header sidebar toggle, theme dropdown, logout confirmation`.

### Task 4: Tabel, form, dan filter (poin 1) + minor terkait

**Files:** Modify `ui/table/*.svelte` atau `app.css` (sudut baris total), `DataTable.svelte`, `FormField.svelte`, `DateField.svelte`, `FilterActions.svelte`, `journal`/`ledger`/`trial-balance`/`balance-sheet` `+page.svelte`, `settings/accounts/+page.svelte`, `uploads/[id]/+page.svelte`, `uploads/new/+page.svelte`, `login/+page.svelte`, `lib/forms/form-state.svelte.ts`, `lib/server/users/service.ts`, `ui/input/input.svelte`. Test: `tests/unit/form-state.test.ts` (baru), `e2e/datefield.spec.ts`, `e2e/validation.spec.ts`, integrasi `api-errors.test.ts`.

- [ ] **Step 1: Test yang gagal:**
  - Unit `FormState`: error server dengan key tak dikenal + key dikenal → pesan umum dikembalikan.
  - Integrasi: `password_required` memakai field `name` saat nama kosong, `password` saat password kosong.
  - E2E: tanggal setengah mengetik memblokir submit dan menampilkan `Lengkapi tanggal`; klik label `Tanggal mulai` memfokuskan segmen pertama; Tab keluar dari tanggal Saldo Awal yang tidak valid menampilkan error; Reset nonaktif saat filter sama dengan default walau ada query; memilih ulang file upload yang sama setelah ditolak menampilkan pesan lagi; error login tanpa JS berstatus `aria-invalid`; kode akun di tabel tidak patah baris; pencarian detail upload cocok dengan kode akun saran.
- [ ] **Step 2:** Jalankan test terkait. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasi semua butir: sudut baris total membulat; elipsis `aria-hidden`; `whitespace-nowrap` kode akun; teks pencarian detail upload; `DateField` (partial + blokir submit + focusout + fokus label); `FilterActions` menerima `active`; reset input file; ARIA login; `password_required`; `FormState`; `Input` tanpa `dark:bg-input/30`; cincin fokus dropzone.
- [ ] **Step 4:** Jalankan `bun run test && bunx playwright test && bun run check`. Harus PASS.
- [ ] **Step 5:** Commit `fix(app): table/form/filter polish and minor review findings`.

### Task 5: Dashboard — minor + zona waktu

**Files:** Modify `lib/dates.ts` (`todayIso(now?: Date)` zona `Asia/Jakarta`), `lib/server/dashboard/next-step.ts`, `lib/server/reports/dashboard.ts`, `lib/server/reports/balance-sheet.ts` (field `profit`), `(app)/+layout.server.ts`, `(app)/dashboard/+page.server.ts` + `+page.svelte`, `dashboard/StatBars.svelte`, `dashboard/ReviewCard.svelte` bila perlu. Test: `tests/unit/dates.test.ts`, `tests/integration/dashboard.test.ts`, `tests/integration/balance-sheet.test.ts`.

**Interfaces:** `todayIso(now = new Date()): string` memberi tanggal `Asia/Jakarta`. `getBalanceSheet(...).profit: { thisYear: string; priorYears: string }`. `DashboardView.fiscalYearStart: string`. `getDashboard(companyId, role, today, shared?: { pending: number; opening: boolean })`.

- [ ] **Step 1: Test yang gagal:**
  - Unit: `todayIso(new Date('2026-08-31T20:00:00Z'))` = `2026-09-01`.
  - Integrasi: pending count tidak menghitung transaksi dari upload `processing`.
  - `getBalanceSheet` memuat `profit.thisYear`.
  - `getDashboard` memuat `fiscalYearStart` mengikuti `companies.fiscalYear`, dan memakai `shared` tanpa query ulang.
- [ ] **Step 2:** Jalankan test terkait. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasi, termasuk `StatBars` yang mewarnai bulan rugi dengan warna destruktif dan keterangan "Tahun buku mulai …".
- [ ] **Step 4:** Jalankan `bun run test && bunx playwright test && bun run check`. Harus PASS.
- [ ] **Step 5:** Commit `fix(app): dashboard pending count, fiscal-year caption, loss bars, Jakarta time`.

### Task 6: Verifikasi menyeluruh

- [ ] **Step 1:** Jalankan `cd app && bun run test && bun run check && bun run build && bunx playwright test`. Semua harus PASS.
- [ ] **Step 2:** Cek visual di Chrome, kedua tema, desktop dan 390px: top bar (toggle + pemilih perusahaan + tema + profil), Jurnal Umum (pensil + dialog), Chart of Accounts (dialog hapus kosong dan terpakai), logout dialog, tabel dengan baris total.
- [ ] **Step 3:** Commit perbaikan yang ditemukan; reviewer akhir; laporan.
