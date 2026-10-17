# Tutup Buku (Fase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin bisa menutup tahun buku. Saat ditutup, aplikasi membuat jurnal penutup yang memindahkan laba ke laba ditahan, lalu mengunci periode itu dari semua perubahan. Admin juga bisa membuka kembali tahun yang paling akhir ditutup. Semua laporan tetap benar sebelum dan sesudah tutup buku.

**Architecture:**
- Nilai enum baru `CLOSING` dan tabel `fiscal_closings`, lewat migrasi Drizzle.
- Service `src/lib/server/closing/*` berisi tiga bagian: daftar tahun buku, tutup/buka, dan helper kunci periode `assertPeriodOpen`. Helper kunci dipasang di setiap jalur tulis.
- Laporan Fase 1 disesuaikan cara memperlakukan jurnal CLOSING.
- UI berupa halaman `Pengaturan → Tutup Buku`.

**Tech Stack:** SvelteKit + Svelte 5 runes, Drizzle/Postgres (drizzle-kit migrations di `app/drizzle/migrations`), Zod 4, bits-ui, bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-period-reports-and-year-closing-design.md` (bagian Fase 2 dan "Diputuskan Claude").

## Global Constraints
- **Tanpa dependensi baru.** Uang hanya lewat `D`/`sumMoney`/`toMoney`. "Hari ini" memakai `todayIso()`. Pesan dalam Bahasa Indonesia. Error per field memakai `new ApiError(status, code, message, undefined, { field })`.
- **Kunci periode.** Sebuah tanggal dianggap **terkunci** bila `date <= max(fiscal_closings.periodEnd)` untuk perusahaan itu. Karena tutup buku berurutan, aturan ini sama dengan "ada di tahun tertutup atau sebelumnya", sehingga Saldo Awal dan upload lama ikut terkunci. Bila terkunci → `ApiError(409, 'period_closed', 'Tahun buku {label} sudah ditutup. Buka kembali dulu untuk mengubah.')`. `{label}` adalah label tahun buku tertutup yang memuat tanggal itu, atau label tahun tertutup terakhir bila tanggal ada sebelum tahun tertutup pertama.
- **Label tahun buku:** `fiscalYearLabel(start, end)` → `"2026"` bila tahun `start` sama dengan tahun `end`, selain itu `"2025/2026"`.
- **Jurnal penutup:**
  - `type 'CLOSING'`, `entryDate = periodEnd`, `refNo = 'TUTUP-{label}'`, `description = 'Jurnal penutup tahun buku {label}'`, `createdBy = userId`.
  - Isinya membalik saldo bersih (debit − kredit) tiap akun REVENUE/EXPENSE pada `[periodStart, periodEnd]`, dengan semua tipe jurnal **kecuali CLOSING** (OPENING ikut dihitung).
  - Satu baris penyeimbang ke akun laba ditahan, sehingga jurnal seimbang. Akun dengan saldo nol tidak dibuat barisnya.
- **Perlakuan CLOSING di laporan:**
  - Posisi Keuangan mengabaikan CLOSING dengan `entryDate >= fiscalYearStart(asOf)`.
  - Laba Rugi selalu mengabaikan CLOSING.
  - Neraca Saldo: saldo awal selalu memasukkan CLOSING `< from`. Mutasi tidak memasukkan CLOSING, kecuali `includeClosing`.
  - Jurnal Umum dan Buku Besar menampilkan CLOSING apa adanya.
- **Peran:** semua API dan halaman Tutup Buku minimal `admin`.
- **Tidak boleh berubah:** teks e2e yang sudah ada, badge `Balance`/`Tidak balance`, dan tanda tangan fungsi yang dipakai dashboard (`getBalanceSheet(companyId, asOf)`, `getTrialBalance(companyId, range)` beserta field `balanced`).
- **Commit** diakhiri `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Perintah dijalankan dari `app/`.

## Review Focus
1. **Tutup lalu buka kembali lalu tutup lagi.** Hasilnya harus satu jurnal penutup dan satu baris closing, tanpa duplikat refNo atau unique violation. Ditest di Task 3.
2. **Posisi Keuangan per 31 Des tahun yang ditutup dan per tanggal tahun berikutnya.** Total aset, liabilitas, dan ekuitas harus identik sebelum dan sesudah tutup buku. Baris laba tahun berjalan untuk tahun tertutup tetap tampil di laporan 31 Des. Ditest di Task 2 dan 3.
3. **Klik "Tutup Buku" dua kali bersamaan.** Penguncian baris perusahaan (`for update`) harus mencegah dua jurnal penutup. Hasilnya satu sukses dan satu `already_closed`. Ditest di Task 3 dengan `Promise.allSettled`.
4. **Hapus akun yang hanya punya baris di tahun terbuka, padahal akun lain punya baris di tahun tertutup.** Pemblokiran hanya berlaku bila akun *itu sendiri* punya baris jurnal bertanggal terkunci. Ditest di Task 4.
5. **Upload rekening koran yang melintasi akhir tahun tertutup** (Des–Jan) setelah tahun ditutup. Seluruh upload ditolak `period_closed`, tanpa upload setengah tersimpan. Ditest di Task 4.

---

### Task 1: Skema dan migrasi

**Files:**
- Modify: `app/src/lib/server/db/schema.ts`
- Create: migrasi baru di `app/drizzle/migrations/` (dibuat dengan `bun run db:generate`, lalu periksa SQL-nya)
- Modify: `app/src/lib/server/journal/queries.ts` (union `type` menjadi `'OPENING' | 'TRANSACTION' | 'CLOSING'`)
- Modify: `app/src/routes/(app)/journal/+page.svelte` (badge `Penutup` untuk CLOSING, di samping badge `Saldo awal` yang ada)
- Test: `app/tests/integration/closing-schema.test.ts`

**Interfaces:**
- Produces:
  - `journalType` enum: `['OPENING', 'TRANSACTION', 'CLOSING']`
  - Tabel `fiscalClosings` (`fiscal_closings`):
    - `id` uuid pk
    - `companyId` → companies, cascade
    - `periodStart` day, notNull
    - `periodEnd` day, notNull
    - `journalId` → journal_entries, `onDelete: 'set null'`, nullable
    - `retainedEarningsAccountId` → accounts, notNull
    - `closedBy` → user, set null
    - `closedAt` timestamptz, defaultNow
    - unique `(companyId, periodStart)`

- [ ] **Step 1: Tulis test yang gagal.** `test('closing journal type and fiscal_closings row can be stored')`:
  - insert journal entry `type: 'CLOSING'` + satu baris `fiscalClosings` yang merujuknya
  - insert kedua untuk `(companyId, periodStart)` yang sama → reject (unique)
  - hapus perusahaan → baris closing ikut terhapus
- [ ] **Step 2:** `bun test tests/integration/closing-schema.test.ts`. Expected: FAIL (`fiscalClosings` tidak ada / nilai enum tidak valid)
- [ ] **Step 3:** Ubah skema, `bun run db:generate`, periksa SQL. Harus ada `ALTER TYPE journal_type ADD VALUE 'CLOSING'` dan `CREATE TABLE fiscal_closings`. Pastikan helper DB test menjalankan migrasi (cek `tests/integration/db.ts` dan setup). Perbarui union di `queries.ts` dan badge di halaman jurnal.
- [ ] **Step 4:** `bun test tests/integration/closing-schema.test.ts && bun run check`. Expected: PASS
- [ ] **Step 5: Commit** `feat(app): closing journal type and fiscal_closings table`

---

### Task 2: Laporan memperhitungkan jurnal CLOSING

**Files:**
- Modify: `app/src/lib/server/reports/balance-sheet.ts`, `income-statement.ts`, `trial-balance.ts`
- Modify: `app/src/lib/components/PeriodFilter.svelte` (snippet opsional `extra` dan prop `extraActive?: boolean`)
- Modify: `app/src/routes/(app)/trial-balance/+page.server.ts`, `+page.svelte`, `app/src/routes/api/reports/trial-balance/+server.ts`
- Test: `app/tests/integration/closing-reports.test.ts`, `app/tests/e2e/period-reports.spec.ts` (tambahan)

**Interfaces:**
- Consumes: tipe `CLOSING` (Task 1).
- Produces:
  - `getTrialBalance(companyId, range, opts?: { includeClosing?: boolean })`
    - default `false`: CLOSING di dalam `[from,to]` tidak masuk mutasi maupun saldo akhir. CLOSING `< from` tetap masuk saldo awal.
  - Param halaman/API `closing=1` → `includeClosing: true`
  - `PeriodFilter` props tambahan: `extra?: Snippet` (dirender sebelum `FilterActions`) dan `extraActive?: boolean` (OR dengan aktif tanggal)
  - Halaman Neraca Saldo memakai `SimpleSelect name="closing"` dengan `aria-label="Jurnal penutup"` dan opsi `''` → "Sebelum jurnal penutup", `'1'` → "Setelah jurnal penutup"

- [ ] **Step 1: Tulis test yang gagal.** Fixture:
  - Data Laba Rugi Fase 1: OPENING 2026-01-01 dan transaksi 2026 dengan laba bersih `3150000.00` (salin fixture dari `tests/integration/income-statement.test.ts`)
  - Ditambah satu jurnal CLOSING **manual** tertanggal `2026-12-31` yang membalik saldo tiap akun REVENUE/EXPENSE 2026 ke `3-1003` (helper test lokal `insertClosing(companyId)`)
  - Test:
    - `test('balance sheet ignores closing of the as-of fiscal year')`:
      - per `2026-12-31`: baris `Laba (Rugi) Tahun Berjalan` = `3150000.00`, `Saldo Laba Ditahan` tidak muncul (nol), total ekuitas sama dengan sebelum CLOSING disisipkan (hitung `before` dulu)
      - per `2027-01-31`: `Saldo Laba Ditahan` = `3150000.00`, tidak ada baris `Laba (Rugi) Tahun-tahun Lalu`, totals sama dengan `before` versi 2027
    - `test('income statement ignores closing journals')`: range 2026 → netProfit `3150000.00`
    - `test('trial balance excludes closing from movement unless asked')`:
      - range 2026: akun `4-1001` `closingCredit` `5000000.00`
      - dengan `includeClosing: true`: `4-1001` hilang (nol) dan `3-1003` `closingCredit` `3150000.00`
      - keduanya `balanced`
      - range 2027-01-01..2027-01-31: `3-1003` `openingCredit` `3150000.00` dan tidak ada akun pendapatan/beban
  - E2E: goto `/trial-balance?from=2026-01-01&to=2026-12-31&closing=1` → combobox `Jurnal penutup` berisi "Setelah jurnal penutup", Reset aktif dan mengarah ke `/trial-balance`.
- [ ] **Step 2:** `bun test tests/integration/closing-reports.test.ts`. Expected: FAIL
- [ ] **Step 3: Implementasikan.**
  - Balance sheet: tambahkan kondisi `not (type = 'CLOSING' and entryDate >= fyStart)` pada `naturalSince`.
  - Income statement: `type <> 'CLOSING'`.
  - Trial balance: CASE saldo awal tetap memasukkan semua tipe `< from`. Ekspresi mutasi memakai `type NOT IN ('OPENING','CLOSING')` kecuali `includeClosing` (maka `type <> 'OPENING'`).
  - Page/API membaca `closing`.
- [ ] **Step 4:** `bun test tests/integration/closing-reports.test.ts tests/integration/balance-sheet.test.ts tests/integration/income-statement.test.ts tests/integration/trial-balance-period.test.ts && bun run check`, lalu `bunx playwright test tests/e2e/period-reports.spec.ts`. Expected: PASS
- [ ] **Step 5: Commit** `feat(app): reports treat closing journals correctly`

---

### Task 3: Service tutup buku

**Files:**
- Create: `app/src/lib/server/closing/years.ts`, `app/src/lib/server/closing/close.ts`
- Modify: `app/src/lib/periods.ts` (tambah `fiscalYearEnd(start: string): string` dan `fiscalYearLabel(start: string, end: string): string`)
- Test: `app/tests/integration/closing.test.ts`, `app/tests/unit/periods.test.ts` (tambahan)

**Interfaces:**
- Consumes: `fiscalYearStart`, `dayBefore`, `shiftYears` (`$lib/periods`), `getCompanyReportInfo`, `assertLeafAccount` (`accounts/queries`), dan `getIncomeStatement` (untuk laba bersih).
- Produces:

```ts
// years.ts
export interface FiscalYearRow {
	periodStart: string; periodEnd: string; label: string;
	status: 'open' | 'closed'; ended: boolean; // ended = periodEnd < today
	netProfit: string;                          // laba bersih periode, tanpa CLOSING
	closedAt: string | null; closedByName: string | null;
	canClose: boolean; canReopen: boolean;      // canClose: open && ended && semua tahun sebelumnya closed; canReopen: tahun closed terakhir
}
export async function listFiscalYears(companyId: string, today?: string): Promise<FiscalYearRow[]>;
// Tahun pertama = fiscalYearStart(entryDate jurnal non-OPENING paling awal); terakhir = fiscalYearStart(today). Tanpa jurnal non-OPENING → [].
export async function lockedThrough(ex: Executor, companyId: string): Promise<{ periodEnd: string; label: string } | null>;
// close.ts
export async function closeFiscalYear(companyId: string, userId: string, input: { periodStart: string; retainedEarningsAccountId: string }, today?: string): Promise<{ journalId: string | null }>;
export async function reopenFiscalYear(companyId: string, periodStart: string): Promise<void>;
export const CloseInput: z.ZodType; // { periodStart: isoDate, retainedEarningsAccountId: uuid } dengan pesan Indonesia, di app/src/lib/schemas/closing.ts
```

- **Aturan `closeFiscalYear`** (dalam satu `db.transaction`, diawali `select … from companies where id = $1 for update`):
  1. `periodStart` harus awal tahun buku (`fiscalYearStart(periodStart) === periodStart`), bila tidak → 422 `invalid_period` field `periodStart`. `periodEnd = fiscalYearEnd(periodStart)`.
  2. Sudah ada baris closing untuk periode itu → 409 `already_closed`.
  3. `periodEnd >= today` → 409 `year_not_ended` dengan pesan "Tahun buku {label} belum berakhir".
  4. **Urutan:**
     - Bila `lockedThrough` ada dan `periodStart !== dayAfter(lockedThrough.periodEnd)` → 409 `previous_year_open`.
     - Bila belum ada closing dan ada jurnal non-OPENING bertanggal `< periodStart` → 409 `previous_year_open`.
     - Pesan: "Tutup dulu tahun buku sebelumnya".
  5. **Transaksi tertunda:** transaksi `isConfirmed = false` bertanggal dalam periode, ditambah upload status `processing`/`review` yang punya transaksi dalam periode → 409 `pending_transactions`, pesan "Masih ada {n} transaksi yang belum dikonfirmasi di tahun buku {label}" (n = jumlah transaksi belum dikonfirmasi; bila n = 0 tapi ada upload processing, pakai "Masih ada upload yang sedang diproses di tahun buku {label}").
  6. **Belum dijurnal:** transaksi terkonfirmasi dalam periode tanpa journal entry → 409 `journal_not_generated`, pesan "{n} transaksi di tahun buku {label} belum dibuatkan jurnal".
  7. **Akun laba ditahan:** harus akun EQUITY yang aktif dan leaf, bila tidak → 422 `invalid_retained_earnings` field `retainedEarningsAccountId`.
  8. **Jurnal penutup** dibuat sesuai Global Constraints. Bila semua saldo nol, tidak ada jurnal (`journalId = null`). Lalu insert baris `fiscal_closings`.
- **Aturan `reopenFiscalYear`** (transaksi + lock perusahaan):
  - Baris closing tidak ada → 404 `notFound('Tutup buku')`
  - Bukan closing dengan `periodStart` terbesar → 409 `not_latest_closing` ("Hanya tahun buku yang terakhir ditutup yang bisa dibuka kembali")
  - Hapus journal entry (cascade baris) dan baris closing.

- [ ] **Step 1: Tulis test yang gagal.**
  - **Unit:**
    - `fiscalYearEnd('2026-01-01') === '2026-12-31'`
    - `fiscalYearEnd('2025-07-01') === '2026-06-30'`
    - `fiscalYearLabel('2026-01-01','2026-12-31') === '2026'`
    - `fiscalYearLabel('2025-07-01','2026-06-30') === '2025/2026'`
  - **Integrasi** (fixture Laba Rugi 2026 dari Task 2 tanpa CLOSING manual, `today = '2027-02-10'`):
    - `test('closing creates a balanced journal moving profit to retained earnings')`:
      - jurnal `TUTUP-2026` tanggal `2026-12-31`
      - baris `3-1003` kredit `3150000.00`
      - `4-1001` debit `5000000.00`
      - `4-1003` kredit `200000.00`
      - total debit = kredit
      - baris closing tersimpan
    - `test('balance sheet totals are identical before and after closing')`: per `2026-12-31` dan `2027-01-31`, bandingkan `assets.total`, `liabilities.total`, `equity.total`
    - `test('closing preconditions')`, masing-masing pada perusahaan terpisah:
      - (a) transaksi belum dikonfirmasi 2026 → `pending_transactions`
      - (b) transaksi terkonfirmasi belum di-generate → `journal_not_generated`
      - (c) `today = '2026-12-31'` → `year_not_ended`
      - (d) ada transaksi 2025 dan tutup 2026 dulu → `previous_year_open`
      - (e) akun laba ditahan bertipe ASSET → `invalid_retained_earnings` dengan `field: 'retainedEarningsAccountId'`
      - (f) `periodStart '2026-02-01'` → `invalid_period`
    - `test('only the latest closed year can be reopened; close-reopen-close is clean')`:
      - tutup 2025 (perusahaan dengan data 2025 dan 2026)
      - tutup 2026
      - buka 2025 → `not_latest_closing`
      - buka 2026 → OK
      - tutup 2026 lagi → OK
      - hanya satu journal `TUTUP-2026` dan satu baris closing 2026
    - `test('double close is serialized')`: `Promise.allSettled` dua `closeFiscalYear` 2026 → tepat satu fulfilled, satu rejected `already_closed`, satu jurnal penutup
    - `test('listFiscalYears reports status and permissions')`:
      - data 2025–2026, `today = '2027-02-10'`
      - tiga baris 2025, 2026, 2027
      - hanya 2025 `canClose`
      - setelah tutup 2025: 2025 `canReopen`, 2026 `canClose`, 2027 `ended=false` dan `canClose=false`
      - `netProfit` 2026 = `3150000.00`
- [ ] **Step 2:** `bun test tests/integration/closing.test.ts tests/unit/periods.test.ts`. Expected: FAIL
- [ ] **Step 3:** Implementasikan sesuai Interfaces dan aturan. `dayAfter(d)` boleh ditambahkan ke `periods.ts`.
- [ ] **Step 4:** `bun test tests/integration/closing.test.ts tests/unit/periods.test.ts && bun run check`. Expected: PASS
- [ ] **Step 5: Commit** `feat(app): year-end closing and reopening service`

---

### Task 4: Kunci periode di semua jalur tulis

**Files:**
- Create: `app/src/lib/server/closing/lock.ts`
- Modify:
  - `journal/generate.ts`
  - `journal/edit.ts`
  - `journal/opening.ts`
  - `accounts/delete.ts`
  - `uploads/service.ts` (`createUpload`, `deleteUpload`)
  - `transactions/confirm.ts` (`confirmTransaction`, `bulkConfirm`)
- Test: `app/tests/integration/period-lock.test.ts`

**Interfaces:**
- Consumes: `lockedThrough` (Task 3).
- Produces:
  - `assertPeriodOpen(ex: Executor, companyId: string, dates: string[]): Promise<void>`: melempar `period_closed` (Global Constraints) bila ada tanggal `<=` `lockedThrough.periodEnd`. Bila `dates` kosong atau tidak ada closing, tidak melakukan apa-apa.
- **Pemasangan:**

  | Jalur | Tanggal yang dicek | Kapan |
  |---|---|---|
  | `generateJournal` | semua `txnDate` baris yang akan dijurnal | sebelum insert |
  | `updateJournalAccount` | `entry.entryDate` | — |
  | `saveOpening` | `input.date` | dan tolak bila ada closing apa pun |
  | `deleteAccount` | `entryDate` semua jurnal yang punya baris akun itu | hanya bila akun dipakai |
  | `deleteUpload` | `entryDate` jurnal milik upload | dibungkus `db.transaction` |
  | `confirmTransaction` / `bulkConfirm` | `txnDate` transaksi yang diubah | — |
  | `createUpload` | semua `txnDate` dari hasil parse | **sebelum** menyimpan apa pun (tolak seluruh upload) |

  - Saldo Awal dengan closing apa pun memakai pesan yang sama, dengan label tahun tertutup terakhir.

- [ ] **Step 1: Tulis test yang gagal.** Satu test per jalur. Fixture: perusahaan dengan data 2026 yang sudah ditutup lewat `closeFiscalYear(..., '2027-02-10')`, ditambah upload Januari 2027 yang terbuka.
  - `generateJournal` untuk upload berisi transaksi 2026 yang baru dikonfirmasi → `period_closed` (fixture: buat upload 2026 kedua setelah tutup buku langsung lewat factory `makeUpload`, karena `createUpload` sendiri akan menolak)
  - `updateJournalAccount` pada jurnal 2026 → `period_closed`; pada jurnal Jan 2027 → OK
  - `saveOpening` (tanggal apa pun) → `period_closed`
  - `deleteAccount` akun `5-2010` (punya baris 2026) dengan `moveToId` → `period_closed`; akun yang hanya punya baris 2027 → OK (Review Focus #4)
  - `deleteUpload` upload 2026 → `period_closed`, upload tetap ada
  - `confirmTransaction` transaksi 2026 belum dikonfirmasi (dari factory) → `period_closed`
  - `createUpload` dengan transaksi Des 2026 + Jan 2027 → `period_closed`, jumlah upload dan transaksi tidak berubah (Review Focus #5). Lihat `tests/integration` yang sudah memanggil `createUpload` untuk cara memanggilnya dengan hasil parse tiruan.
  - Pesan error berisi `Tahun buku 2026 sudah ditutup`.
- [ ] **Step 2:** `bun test tests/integration/period-lock.test.ts`. Expected: FAIL
- [ ] **Step 3:** Implementasikan `lock.ts` dan pasang di setiap jalur, di dalam transaksi yang sudah ada bila ada.
- [ ] **Step 4:** `bun run test && bun run check`. Expected: semua PASS (test lama tidak terpengaruh karena tanpa closing)
- [ ] **Step 5: Commit** `feat(app): lock closed fiscal years against every write path`

---

### Task 5: API, halaman Tutup Buku, dan menu

**Files:**
- Create: `app/src/routes/api/closings/+server.ts` (GET list, POST close), `app/src/routes/api/closings/[periodStart]/+server.ts` (DELETE reopen)
- Create: `app/src/routes/(app)/settings/closing/+page.server.ts`, `+page.svelte`
- Modify: `app/src/lib/nav.ts` (item `{ label: 'Tutup Buku', href: '/settings/closing', min: 'admin', icon: 'closing' }` setelah Saldo Awal), `AppSidebar.svelte` (ikon `closing` → `@lucide/svelte/icons/lock`)
- Test: `app/tests/integration/closing-api.test.ts`, `app/tests/e2e/closing.spec.ts`

**Interfaces:**
- Consumes: `listFiscalYears`, `closeFiscalYear`, `reopenFiscalYear`, `CloseInput` (Task 3), `formatPeriod`, `formatAccounting`.
- Produces:
  - `GET /api/closings` → `FiscalYearRow[]`
  - `POST /api/closings` body `CloseInput` → 201 `{ journalId }`
  - `DELETE /api/closings/:periodStart` → 200 `{ ok: true }`
  - Semua minimal `admin`. Accountant → 403, tanpa sesi → 401.
  - Page load → `{ years, equityAccounts: {id, code, name}[] (EQUITY aktif leaf), defaultRetainedEarningsId: string | null }`. Default diambil dari akun bernama tepat `Saldo Laba Ditahan`.

- [ ] **Step 1: Tulis test yang gagal.**
  - **Integrasi API:**
    - 401/403/200 untuk GET
    - POST sukses 201 lalu GET menunjukkan `status: 'closed'`
    - POST `pending_transactions` → 409 dengan pesan Indonesia
    - DELETE bukan yang terakhir → 409 `not_latest_closing`
    - DELETE sukses 200
  - **E2E** `closing.spec.ts`:
    - Buat perusahaan khusus test lewat UI (pola `settings/company?new=1` di e2e yang ada) agar tidak mengganggu test paralel.
    - Isi data dengan Saldo Awal bertanggal tahun lalu dan... cukup: halaman `/settings/closing` menampilkan keadaan kosong "Belum ada transaksi yang dijurnal" bila tidak ada jurnal non-OPENING.
    - Uji alur tutup/buka lewat API request di dalam test (`page.request.post('/api/closings', …)`) setelah membuat data lewat factory e2e yang tersedia. Bila e2e tidak punya cara membuat jurnal non-OPENING tanpa upload PDF, uji hanya: menu `Tutup Buku` terlihat untuk admin, halaman memuat judul `Tutup Buku` dan keadaan kosong, dan catat keterbatasan ini di report.
- [ ] **Step 2:** `bun test tests/integration/closing-api.test.ts`. Expected: FAIL
- [ ] **Step 3: Implementasikan.**
  - **Halaman:** `PageHeader` "Tutup Buku" dengan deskripsi "Tutup tahun buku yang sudah selesai agar jurnalnya terkunci."
  - **Tabel:** Periode (`formatPeriod`), Status (badge `Ditutup` / `Terbuka`), Laba bersih (`formatAccounting`), Ditutup (tanggal + nama), dan Aksi. Tombol "Tutup Buku" hanya bila `canClose`, "Buka Kembali" hanya bila `canReopen`.
  - **Dialog tutup** (bits-ui Dialog, pola `DeleteAccountDialog.svelte`):
    - judul "Tutup tahun buku {label}?"
    - teks laba bersih yang dipindah
    - `SearchSelect` akun laba ditahan dengan label "Akun laba ditahan"
    - tombol "Tutup Buku"
    - error server tampil di dialog (field error di bawah select)
  - **Dialog buka kembali:** judul "Buka kembali tahun buku {label}?", teks "Jurnal penutup akan dihapus dan jurnal tahun ini bisa diubah lagi.", tombol destruktif "Buka Kembali".
  - Setelah sukses: `invalidateAll()` dan pesan sukses.
- [ ] **Step 4:** `bun run test && bun run check && bun run build && bunx playwright test`. Expected: semua PASS
- [ ] **Step 5: Commit** `feat(app): year-end closing page, API and menu`
