# Hapus Perusahaan & Manajemen Pengguna Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Super Admin dapat menghapus perusahaan beserta seluruh datanya, dan mengelola (buat, lihat, ubah, hapus, atur keanggotaan) semua pengguna sistem.

**Architecture:** Dua service server baru (`deleteCompany` di `company/service.ts`; modul `users/admin.ts`) dibungkus rute API khusus Super Admin, lalu satu kartu "Hapus perusahaan" di halaman Perusahaan dan satu halaman baru "Semua Pengguna". Penghapusan mengandalkan `ON DELETE CASCADE` / `SET NULL` yang sudah ada di skema, sehingga tidak ada migrasi.

**Tech Stack:** SvelteKit 2 + Svelte 5, Drizzle (Postgres), Better Auth, zod 4, bits-ui/shadcn-svelte, `bun test` (unit + integrasi), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-10-26-company-delete-and-user-admin-design.md`

Semua perintah dijalankan dari folder `app/`.

## Global Constraints

- Hanya Super Admin (`requireSuperAdmin` / pemeriksaan setara untuk halaman) yang boleh memakai fitur baru; admin perusahaan tidak mendapat hak baru.
- Hapus perusahaan = hapus permanen semua data perusahaan itu; tanpa soft delete.
- Konfirmasi hapus perusahaan = mengetik nama perusahaan persis.
- Hapus pengguna = hapus permanen akun, sesi, kredensial, avatar, keanggotaan; data buatannya tetap ada dengan kolom pembuat kosong (`SET NULL` sudah berlaku).
- Super Admin tidak bisa menghapus akunnya sendiri, dan tidak bisa menghapus Super Admin terakhir; ditegakkan di server.
- Ubah password oleh Super Admin mencabut semua sesi pengguna itu.
- Email dinormalisasi dengan `normalizeEmail` (`src/lib/server/users/create.ts`) dan harus unik.
- Akun kredensial Better Auth: `accountId = userId`, `providerId = 'credential'`.
- Tidak ada migrasi skema. Semua teks antarmuka dan pesan error berbahasa Indonesia; ikuti pola `apiHandler` / `parseJson` / `ApiError` / `FormState` / `DataTable` yang ada.
- Multi-company tetap ada; jangan menghapus atau mengubah `switch` perusahaan.

## Review Focus

- Super Admin menghapus perusahaan terakhir yang ada: ia tidak boleh buntu. Ia harus tetap bisa membuka halaman pengguna sistem dan membuat perusahaan baru (Task 2 menguji aturannya; Task 5 menguji halamannya).
- Hapus perusahaan yang punya akun bank (`companies.bank_account_id` ↔ `accounts`, referensi melingkar), jurnal, invoice, PO, kontak, penutupan buku, dan logo: tidak boleh gagal karena urutan penghapusan (Task 1).
- Cookie `jk_company` masih menunjuk perusahaan yang baru dihapus: pengguna jatuh ke perusahaan lain miliknya, bukan error (Task 1).
- Hapus pengguna yang pernah membuat jurnal/invoice/upload: datanya tetap ada, pembuat kosong (Task 3).
- Mengubah email ke email milik pengguna lain, atau dengan huruf besar/spasi: ditolak / dinormalisasi (Task 3).
- Pengguna biasa dan admin perusahaan memanggil rute baru: 403, termasuk tanpa login 401 (Task 4).

---

### Task 1: Hapus perusahaan (service + API)

**Files:**
- Modify: `src/lib/schemas/company.ts`
- Modify: `src/lib/server/company/service.ts`
- Modify: `src/routes/api/companies/[id]/+server.ts`
- Test: `tests/integration/company-delete.test.ts`

**Interfaces:**
- Produces:
  - `DeleteCompanyInput = z.object({ confirmName: z.string() })` + tipe, diekspor dari `schemas/company.ts` dan di-re-export `company/service.ts`.
  - `deleteCompany(companyId: string, confirmName: string): Promise<void>` di `company/service.ts`. Melempar `notFound('Perusahaan')` bila tidak ada; `ApiError(422, 'confirm_mismatch', 'Nama perusahaan tidak cocok', undefined, { field: 'confirmName' })` bila `confirmName.trim() !== company.name`.
  - `DELETE /api/companies/[id]` body `{ confirmName }` → `{ ok: true }`; `requireSuperAdmin`; `id` boleh perusahaan mana pun (tidak harus yang aktif); `parseId(event.params.id, 'Perusahaan')`.

- [ ] **Step 1: Tulis tes yang gagal** di `tests/integration/company-delete.test.ts` (pola `companies-api.test.ts`; pakai `makeCompany`, `makeUser`, `addMember`, `contextFor`, `makeUpload`, `fakeEvent`, `call`, `resetDb`). Nama dan assertion:
  - `super admin deletes a company and everything in it`: buat PT A dan PT B, tiap perusahaan diberi satu upload+transaksi (`makeUpload`), satu jurnal, satu kontak, satu invoice, satu `companyLogos`, dan satu keanggotaan. `DELETE` PT A dengan `confirmName: 'PT A'` → 200; hitungan baris `companies`, `accounts`, `categoryRules`, `statementUploads`, `transactions`, `journalEntries`, `contacts`, `invoices`, `companyLogos`, `userCompanies` untuk PT A semuanya 0, dan untuk PT B tetap sama seperti sebelum hapus.
  - `wrong confirmation name is 422 and deletes nothing` (`confirmName: 'pt a '` berbeda huruf/ejaan → 422 kode `confirm_mismatch`, field `confirmName`; perusahaan masih ada). Spasi di ujung boleh (trim), huruf besar/kecil harus persis.
  - `non super admin gets 403; anonymous gets 401; unknown id gets 404` (admin perusahaan biasa → 403).
  - `a member's context falls back to another company after deletion`: pengguna anggota PT A dan PT B; setelah PT A dihapus, `contextFor(u, ptA.companyId)` mengembalikan `companyId === ptB.companyId`; pengguna hanya di PT A → `companyId === null`.
- [ ] **Step 2: Jalankan, pastikan gagal**
  Run: `bun test tests/integration/company-delete.test.ts`
  Expected: FAIL (handler `DELETE` / `deleteCompany` belum ada).

- [ ] **Step 3: Implementasi** `DeleteCompanyInput`, `deleteCompany`, dan handler `DELETE`. `deleteCompany` mengambil perusahaan, membandingkan nama, lalu satu `db.delete(companies).where(eq(companies.id, companyId))` di dalam `db.transaction`; semua tabel anak sudah `ON DELETE CASCADE`. Jangan menghapus tabel anak satu per satu. Bila tes referensi melingkar (bank account) gagal karena urutan, perbaiki di dalam transaksi yang sama dengan `update companies set bank_account_id = null` sebelum delete.

- [ ] **Step 4: Jalankan, pastikan lulus**
  Run: `bun test tests/integration/company-delete.test.ts tests/integration/companies-api.test.ts`
  Expected: semua PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/schemas/company.ts src/lib/server/company/service.ts "src/routes/api/companies/[id]/+server.ts" tests/integration/company-delete.test.ts
  git commit -m "feat(app): super admin can delete a company with all its data"
  ```

---

### Task 2: UI hapus perusahaan + super admin tanpa perusahaan

**Files:**
- Modify: `src/lib/nav.ts`
- Modify: `src/routes/(app)/+layout.server.ts`
- Modify: `src/routes/(app)/+layout.svelte`
- Modify: `src/routes/(app)/settings/company/+page.server.ts`
- Modify: `src/routes/(app)/settings/company/+page.svelte`
- Test: `tests/unit/nav.test.ts`, `tests/e2e/company-delete.spec.ts`

**Interfaces:**
- Consumes: `DELETE /api/companies/[id]` dan `DeleteCompanyInput` (Task 1); `apiFetch`, `FormState`, `FormField`, dialog dari `$lib/components/ui/dialog`.
- Produces: `allowsWithoutCompany(pathname: string, isSuperAdmin: boolean): boolean` di `src/lib/nav.ts`: true untuk `/profile` (siapa pun), dan untuk `/settings/company` atau `/settings/system-users` hanya bila `isSuperAdmin` (beserta turunannya `/…`); selain itu false.

- [ ] **Step 1: Tes unit yang gagal** di `tests/unit/nav.test.ts`:
  - `allowsWithoutCompany('/settings/company', true)` true; `('/settings/system-users', true)` true; `('/profile', false)` true; `('/settings/company', false)` false; `('/ledger', true)` false.
  Run: `bun test tests/unit/nav.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implementasi `allowsWithoutCompany`** di `nav.ts`, lalu pakai di `(app)/+layout.svelte` pada kondisi render konten menggantikan `page.url.pathname === '/profile'` (`ctx.companyId || allowsWithoutCompany(page.url.pathname, ctx.user.isSuperAdmin)`). Pada panel "Belum terhubung ke perusahaan", bila `ctx.user.isSuperAdmin`, tampilkan tautan "Buat perusahaan baru" ke `/settings/company?new=1` dan "Kelola pengguna" ke `/settings/system-users`.
  Run: `bun test tests/unit/nav.test.ts` → Expected: PASS.

- [ ] **Step 3: Load halaman Perusahaan tahan tanpa perusahaan aktif.** Di `settings/company/+page.server.ts`: bila `ctx.companyId` kosong dan Super Admin, kembalikan `company: null`, `assetAccounts: []`, `showNew: true`; bila bukan Super Admin tetap 403 lewat `requirePageRole`. Di `+page.svelte`, bila `data.company` null hanya render kartu "Perusahaan baru"; kartu logo/pengaturan/hapus tidak dirender. (`requirePageRole` gagal untuk ctx tanpa perusahaan, jadi pakai `requireUser`-based pemeriksaan Super Admin untuk cabang ini; di `+layout.server.ts` lewati pemeriksaan `minRoleForPath` hanya bila `ctx.companyId` kosong, perilaku yang sudah ada.)

- [ ] **Step 4: Kartu "Hapus perusahaan"** di `settings/company/+page.svelte`, hanya bila `data.isSuperAdmin && data.company`: kartu bergaya bahaya (pola warna dari token tema yang ada; tes `no-hardcoded-colors` harus tetap lulus) berisi tombol "Hapus perusahaan" yang membuka dialog. Dialog menjelaskan bahwa semua data (akun, transaksi, jurnal, invoice, PO, kontak, upload, logo, keanggotaan) terhapus permanen, meminta mengetik nama perusahaan, dan tombol "Hapus permanen" nonaktif sampai input sama persis dengan `data.company.name`. Setelah sukses: `invalidateAll()` lalu `goto('/dashboard')`. Error server (mis. 422) ditampilkan di dialog lewat `FormState.handleServerError`.

- [ ] **Step 5: Tes e2e** `tests/e2e/company-delete.spec.ts` (login seperti `company-logo.spec.ts`). Alur: buka `/settings/company?new=1`, buat perusahaan "PT Hapus Uji", pilih perusahaan itu bila belum aktif, buka `/settings/company`, klik "Hapus perusahaan"; assert tombol "Hapus permanen" `disabled`; isi nama salah → tetap `disabled`; isi nama benar → klik; assert URL `/dashboard` dan pemilih perusahaan di header tidak lagi memuat "PT Hapus Uji". Tes ini tidak boleh menghapus perusahaan seed.
  Run: `bunx playwright test tests/e2e/company-delete.spec.ts` → Expected: PASS.

- [ ] **Step 6: Periksa tipe** Run: `bun run check` → Expected: 0 error.

- [ ] **Step 7: Commit**
  ```bash
  git add src/lib/nav.ts "src/routes/(app)" tests/unit/nav.test.ts tests/e2e/company-delete.spec.ts
  git commit -m "feat(app): delete-company dialog and super admin access without a company"
  ```

---

### Task 3: Service pengguna sistem

**Files:**
- Create: `src/lib/schemas/user-admin.ts`
- Create: `src/lib/server/users/admin.ts`
- Test: `tests/integration/user-admin.test.ts`

**Interfaces:**
- Consumes: `createUserWithPassword`, `findUserByEmail`, `normalizeEmail` (`users/create.ts`); `hashPassword` (`password.ts`); `changeRole`, `removeMember`, `notFound`, `ApiError`; tabel `user`, `authAccount`, `session`, `userCompanies`, `companies`.
- Produces (`src/lib/schemas/user-admin.ts`, juga di-re-export dari `users/admin.ts`):
  - `CreateUserInput`: `{ name: requiredText('Nama', 200), email: emailField, password: z.string().min(8, 'Password minimal 8 karakter'), isSuperAdmin: z.boolean().default(false) }`.
  - `UpdateUserInput`: `{ name: requiredText('Nama', 200), email: emailField, password: z.string().min(8, 'Password minimal 8 karakter').optional() }`.
  - `SetMembershipInput = ChangeRoleInput` (dari `schemas/member.ts`).
- Produces (`src/lib/server/users/admin.ts`):
  - `type SystemUser = { id: string; email: string; name: string; image: string | null; isSuperAdmin: boolean; createdAt: Date; companies: { id: string; name: string; role: Role }[] }`
  - `listAllUsers(): Promise<SystemUser[]>` urut `email` naik.
  - `createUser(input: CreateUserInput): Promise<{ id: string }>`; email sudah dipakai → `ApiError(409, 'email_taken', 'Email sudah terdaftar', undefined, { field: 'email' })`.
  - `updateUser(userId: string, input: UpdateUserInput): Promise<void>`; `notFound('Pengguna')`; email milik orang lain → `email_taken`; bila `password` ada, ganti hash di akun credential dan hapus semua baris `session` pengguna itu, dalam satu transaksi.
  - `deleteUser(actorId: string, userId: string): Promise<void>`; `actorId === userId` → `ApiError(409, 'cannot_delete_self', 'Anda tidak dapat menghapus akun sendiri')`; target satu-satunya Super Admin → `ApiError(409, 'last_super_admin', 'Super admin terakhir tidak dapat dihapus')`; `notFound('Pengguna')`.
  - `setMembership(userId: string, companyId: string, role: Role): Promise<void>`: membuat keanggotaan bila belum ada, selain itu `changeRole`; `notFound` bila pengguna atau perusahaan tidak ada.
  - Pelepasan keanggotaan memakai `removeMember(companyId, userId)` yang sudah ada.

- [ ] **Step 1: Tulis tes yang gagal** di `tests/integration/user-admin.test.ts` (pakai `makeUser`, `makeCompany`, `addMember`, `makeUpload`, `resetDb`):
  - `listAllUsers returns every user with their companies and roles`.
  - `createUser makes a credential account that can be found by email, duplicates (any case) are 409 email_taken`.
  - `updateUser changes name, normalizes email to lower case, and rejects another user's email`.
  - `updateUser with password replaces the hash and revokes every session of that user but not others`: sisipkan baris `session` untuk dua pengguna lewat `db.insert(session)`; setelah update, `verifyPassword('passwordBaru', hashTersimpan)` benar dan hanya sesi pengguna target yang hilang.
  - `deleteUser removes the user, credentials, sessions and memberships but keeps data they created`: pengguna membuat `makeUpload(companyId, userId, …)` dan satu `journalEntries` dengan `createdBy`; setelah hapus, baris itu masih ada dan `uploadedBy`/`createdBy` bernilai null.
  - `deleteUser refuses self and refuses the last super admin`: `deleteUser(a.id, a.id)` → `cannot_delete_self`; `deleteUser(biasa.id, satuSatunyaSuper.id)` → `last_super_admin`; dengan dua Super Admin, menghapus salah satu oleh yang lain berhasil.
  - `setMembership adds then changes a role; removeMember on the last admin is still refused`.

- [ ] **Step 2: Jalankan, pastikan gagal**
  Run: `bun test tests/integration/user-admin.test.ts`
  Expected: FAIL (modul belum ada).

- [ ] **Step 3: Implementasi** skema dan semua fungsi di atas. `updateUser` memakai `findUserByEmail` untuk cek duplikat (abaikan baris miliknya sendiri). `deleteUser` menghitung jumlah `isSuperAdmin = true` dalam transaksi yang sama dengan penghapusan.

- [ ] **Step 4: Jalankan, pastikan lulus**
  Run: `bun test tests/integration/user-admin.test.ts tests/integration/users-api.test.ts`
  Expected: PASS (tes lama tetap hijau; bila nama berkas tes lama berbeda, jalankan `bun test tests/integration` penuh).

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/schemas/user-admin.ts src/lib/server/users/admin.ts tests/integration/user-admin.test.ts
  git commit -m "feat(app): system-wide user administration service"
  ```

---

### Task 4: Rute API pengguna sistem

**Files:**
- Create: `src/routes/api/admin/users/+server.ts` (GET, POST)
- Create: `src/routes/api/admin/users/[id]/+server.ts` (PATCH, DELETE)
- Create: `src/routes/api/admin/users/[id]/companies/[companyId]/+server.ts` (PUT, DELETE)
- Test: `tests/integration/user-admin-api.test.ts`

**Interfaces:**
- Consumes: semua fungsi Task 3; `requireSuperAdmin`; `parseId(value, label)` (`$lib/server/validation`); `apiHandler`, `parseJson`.
- Produces:
  - `GET /api/admin/users` → `{ users: SystemUser[] }`
  - `POST /api/admin/users` body `CreateUserInput` → 201 `{ id }`
  - `PATCH /api/admin/users/[id]` body `UpdateUserInput` → `{ ok: true }`
  - `DELETE /api/admin/users/[id]` → `{ ok: true }` (memakai `ctx.user.id` sebagai `actorId`)
  - `PUT /api/admin/users/[id]/companies/[companyId]` body `{ role }` → `{ ok: true }`
  - `DELETE /api/admin/users/[id]/companies/[companyId]` → `{ ok: true }`

- [ ] **Step 1: Tulis tes yang gagal** `tests/integration/user-admin-api.test.ts` (pola `companies-api.test.ts`, `fakeEvent({ ctx, method, body, params })`):
  - `every route is 401 anonymous, 403 for company admin and viewer, and works for super admin` (satu tabel metode × rute).
  - `POST validation errors are 400 with field messages` (password pendek, email salah).
  - `super admin cannot delete themselves via the API` (409 `cannot_delete_self`).
  - `PUT membership then DELETE membership round-trips` dan `DELETE` admin terakhir perusahaan → 409 `last_admin`.

- [ ] **Step 2: Jalankan, pastikan gagal**
  Run: `bun test tests/integration/user-admin-api.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementasi** tiga berkas rute tipis: `requireSuperAdmin(event)` lalu panggil service, bentuk sama dengan `api/users/[id]/super-admin/+server.ts`.

- [ ] **Step 4: Jalankan, pastikan lulus**
  Run: `bun test tests/integration/user-admin-api.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/routes/api/admin tests/integration/user-admin-api.test.ts
  git commit -m "feat(app): super admin API for system users and memberships"
  ```

---

### Task 5: Halaman "Semua Pengguna"

**Files:**
- Modify: `src/lib/nav.ts` (`NavItem.superAdminOnly?: boolean`; `visibleNav(role, isSuperAdmin = false)`)
- Modify: `src/routes/(app)/+layout.server.ts` (teruskan `ctx.user.isSuperAdmin`)
- Modify: `src/lib/components/AppSidebar.svelte` (ikon `systemUsers` → `ShieldUser` dari `@lucide/svelte/icons/shield-user`; bila ikon tidak ada di paket, pakai `UserCog`)
- Create: `src/routes/(app)/settings/system-users/+page.server.ts`
- Create: `src/routes/(app)/settings/system-users/+page.svelte`
- Test: `tests/unit/nav.test.ts`, `tests/e2e/system-users.spec.ts`

**Interfaces:**
- Consumes: `listAllUsers`, rute `/api/admin/users…` (Task 3–4); `allowsWithoutCompany` (Task 2); `DataTable`, `FormField`, `FormState`, `SimpleSelect`, `UserAvatar`, dialog, `CreateUserInput`/`UpdateUserInput`.
- Produces: item nav `{ label: 'Semua Pengguna', href: '/settings/system-users', min: 'viewer', icon: 'systemUsers', superAdminOnly: true }` di grup "Pengaturan", sebelum "Pengguna & Role".

- [ ] **Step 1: Tes unit yang gagal** di `tests/unit/nav.test.ts`: `visibleNav('admin', false)` tidak memuat `/settings/system-users`; `visibleNav('admin', true)` memuatnya; `visibleNav(null, true)` memuatnya (Super Admin tanpa perusahaan). Run: `bun test tests/unit/nav.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implementasi nav** (`superAdminOnly` disaring di `visibleNav`; `minRoleForPath` tetap tidak berubah). Run: `bun test tests/unit/nav.test.ts` → Expected: PASS.

- [ ] **Step 3: `+page.server.ts`**: tolak bila bukan Super Admin dengan `error(403, 'Hanya super admin yang dapat membuka halaman ini')` (belum login → redirect `/login`); kembalikan `{ users: await listAllUsers(), companies: <semua perusahaan {id,name}>, me: ctx.user.id }`. Jangan memakai `requirePageRole`, karena Super Admin tanpa perusahaan harus tetap lolos.

- [ ] **Step 4: `+page.svelte`**: `PageHeader title="Semua Pengguna"`; `DataTable` (kolom Nama, Email, Perusahaan, Super admin, aksi); kartu/dialog "Tambah pengguna" (nama, email, password awal, centang Super admin); dialog "Ubah pengguna" (nama, email, password baru opsional dengan hint "Kosongkan bila tidak diganti. Mengganti password mengeluarkan pengguna dari semua perangkat"); dialog "Perusahaan" per pengguna yang menampilkan keanggotaan dan role (`SimpleSelect`) dengan tambah/lepas perusahaan lewat rute `companies/[companyId]`; tombol "Hapus" yang membuka dialog konfirmasi (menyebut bahwa akun dihapus permanen, data yang pernah dibuatnya tetap ada) dan nonaktif untuk baris milik sendiri. Tombol "Jadikan/Cabut super admin" memakai rute `api/users/[id]/super-admin` yang sudah ada. Pesan sukses/gagal lewat `Alert` seperti `settings/users/+page.svelte`.

- [ ] **Step 5: Tes e2e** `tests/e2e/system-users.spec.ts` (login admin seed): buka `/settings/system-users`; tambah pengguna "Uji Sistem" `uji-sistem@jurnalku.local`; muncul di tabel; ubah namanya jadi "Uji Sistem 2" dan password; tambah ke perusahaan seed sebagai Viewer lalu lepas; hapus lewat dialog; baris hilang. Assert tombol "Hapus" pada baris admin seed (diri sendiri) `disabled`. Pengguna dibuat dan dihapus di dalam tes itu sendiri.
  Run: `bunx playwright test tests/e2e/system-users.spec.ts` → Expected: PASS.

- [ ] **Step 6: Periksa tipe dan tema** Run: `bun run check && bun test tests/unit` → Expected: 0 error, semua PASS (termasuk `no-hardcoded-colors`).

- [ ] **Step 7: Commit**
  ```bash
  git add src/lib/nav.ts "src/routes/(app)" src/lib/components/AppSidebar.svelte tests/unit/nav.test.ts tests/e2e/system-users.spec.ts
  git commit -m "feat(app): super admin page to manage all users"
  ```

---

### Task 6: Verifikasi akhir

**Files:**
- Modify: `README.md` (satu paragraf pendek di bagian fitur/peran bila ada bagian yang menyebut pengelolaan pengguna atau perusahaan; bila tidak ada, lewati)

- [ ] **Step 1: Jalankan seluruh tes**
  Run: `bun run test && bun run check && bunx playwright test --reporter=list`
  Expected: semua PASS, 0 error tipe. Bila ada tes lama yang gagal karena `NAV`/`visibleNav` berubah, perbaiki tesnya, bukan perilakunya.

- [ ] **Step 2: Cek manual di build produksi** (`docker compose up -d --build app`, buka `http://localhost:3000` sebagai Super Admin): buat perusahaan uji, hapus; buat pengguna uji, atur perusahaannya, hapus. Laporkan hasilnya apa adanya.

- [ ] **Step 3: Commit dokumentasi bila ada perubahan**
  ```bash
  git add README.md
  git commit -m "docs: mention company deletion and system user management"
  ```
