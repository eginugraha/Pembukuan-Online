# Laporan Berperiode (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat tiga laporan RUPST: Neraca Saldo dengan rentang tanggal (saldo awal, mutasi, dan saldo akhir), Posisi Keuangan dengan kolom pembanding, dan laporan baru Laba Rugi dengan kolom pembanding.

**Architecture:**
- Helper periode murni ada di `$lib/periods.ts`, dipakai server dan klien.
- Service laporan ada di `src/lib/server/reports/*`. Service mengembalikan objek siap tampil dan menghitung uang dengan `D`/`sumMoney`/`toMoney`.
- Halaman `(app)/*` memakai komponen bersama `PeriodFilter` (Dari–Sampai + validasi + `FilterActions`).
- API `api/reports/*` mengembalikan data yang sama dengan halaman.

**Tech Stack:** SvelteKit + Svelte 5 runes, Drizzle/Postgres, Zod 4, bits-ui (`DateField`), bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-period-reports-and-year-closing-design.md` (bagian Fase 1 dan "Diputuskan Claude").

## Global Constraints
- Tidak ada dependensi baru. Uang hanya lewat `D`/`sumMoney`/`toMoney` dari `src/lib/money.ts`, tanpa float.
- Pesan dalam Bahasa Indonesia. "Hari ini" = `todayIso()` (Asia/Jakarta).
- Tahun buku mengikuti `companies.fiscalYear` (nama bulan Inggris kapital, mis. `JANUARY`), lewat `fiscalYearStart`.
- Jurnal `OPENING` dihitung sebagai laba di tahun buku tanggalnya (sama seperti `getBalanceSheet` sekarang). Di Neraca Saldo, jurnal OPENING selalu masuk kolom saldo awal.
- Jurnal `CLOSING` belum ada di Fase 1. Jangan menambah enum.
- Tabel laporan tanpa urut kolom dan paginasi. Gunakan gaya `panel` dan `total-row` yang ada. Di 390px, tabel lebar scroll horizontal **di dalam** panel (`overflow-x-auto`), dan halaman tidak boleh ikut scroll horizontal.
- Badge `Balance` / `Tidak balance` (teks exact) tetap ada di Neraca Saldo dan Posisi Keuangan.
- Tanda tangan `getBalanceSheet(companyId, asOf)` dan field `profit`/`fiscalYearStart` tidak berubah, karena dashboard memakainya.
- Commit diakhiri: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (implementer Sonnet).
- Perintah test dijalankan dari `app/`. `bun run test` butuh Postgres test (docker) yang sudah dipakai suite.

## Review Focus
1. **Saldo Awal bertanggal sama dengan `from`:** harus masuk kolom saldo awal, bukan mutasi. Kalau salah, mutasi periode pertama membengkak. Ditest di Task 2.
2. **Tahun buku non-Januari:** default periode, pembanding Posisi Keuangan, dan pembanding Laba Rugi harus mengikuti `fiscalYear`. Ditest di Task 1, 4, dan 5.
3. **Akun yang hanya punya saldo di salah satu kolom pembanding:** baris tetap muncul di kedua kolom (nilai 0 di kolom lainnya), dan bentuk pohon kedua kolom identik. Ditest di Task 4 dan 5.
4. **`from > to` di URL** (diketik manual): halaman menampilkan error 400 dengan pesan Indonesia, bukan 500. Form mencegah submit dengan pesan di bawah field. Ditest di Task 1 dan 3.
5. **Konsistensi Laba Bersih:** Laba Rugi `[awal tahun buku, as_of]` sama dengan `profit.thisYear` di Posisi Keuangan, termasuk saat ada akun retur (REVENUE bersaldo debit) dan akun pajak. Ditest di Task 5.

---

### Task 1: Helper periode dan validasi rentang

**Files:**
- Create: `app/src/lib/periods.ts`
- Modify: `app/src/lib/server/reports/balance-sheet.ts` (hapus definisi `fiscalYearStart` dan `MONTHS`, ganti dengan `export { fiscalYearStart } from '../../periods'`)
- Modify: `app/src/lib/server/validation.ts` (tambah `rangeParams`)
- Create: `app/src/lib/server/reports/company.ts`
- Test: `app/tests/unit/periods.test.ts`, `app/tests/integration/report-params.test.ts`

**Interfaces:**
- Produces (`$lib/periods.ts`, murni, tanpa import server):
  - `fiscalYearStart(date: string, startMonth: string): string` (dipindah apa adanya; test `tests/unit/balance-sheet.test.ts` yang lama harus tetap lulus)
  - `dayBefore(date: string): string`
  - `previousFiscalYearEnd(date: string, startMonth: string): string` = `dayBefore(fiscalYearStart(date, startMonth))`
  - `shiftYears(date: string, years: number): string`: tanggal yang melewati akhir bulan dijepit ke hari terakhir bulan (`2024-02-29` −1 → `2023-02-28`)
  - `defaultReportRange(today: string, startMonth: string): { from: string; to: string }` = `{ from: fiscalYearStart(today), to: monthRange(today).to }`
  - `defaultBalanceSheetAsOf(today: string, startMonth: string): string`: bila bulan `today` = bulan awal tahun buku, hasilnya `previousFiscalYearEnd(today)`; selain itu `monthRange(today).to`
  - `formatDateLong(date: string): string` → `"1 Januari 2026"` (nama bulan Indonesia lengkap, hari tanpa nol di depan)
  - `formatPeriod(from: string, to: string): string` → `"1 Januari 2026 – 31 Desember 2026"` (pemisah en dash dengan spasi)
- Produces (server):
  - `rangeParams(url: URL, defaults: { from: string; to: string }): { from: string; to: string }` di `validation.ts`:
    - memakai `dateParam` untuk `from` dan `to`, dengan default bila kosong
    - bila hanya `as_of` yang ada (tanpa `from`/`to`), hasilnya `{ from: fiscalYearStart(as_of, startMonth), to: as_of }`. Untuk itu `rangeParams` menerima argumen ketiga `startMonth: string`.
    - bila `from > to` → `throw new ApiError(400, 'invalid_range', 'Tanggal awal harus sebelum tanggal akhir', undefined, { field: 'from' })`
  - `getCompanyReportInfo(companyId: string): Promise<{ name: string; fiscalYear: string }>` di `reports/company.ts`. Melempar `notFound('Perusahaan')` bila tidak ada.

- [ ] **Step 1: Tulis test unit yang gagal** (`tests/unit/periods.test.ts`):

```ts
import { expect, test } from 'bun:test';
import { dayBefore, defaultBalanceSheetAsOf, defaultReportRange, formatDateLong, formatPeriod, previousFiscalYearEnd, shiftYears } from '../../src/lib/periods';

test('period helpers', () => {
	expect(dayBefore('2026-01-01')).toBe('2025-12-31');
	expect(dayBefore('2024-03-01')).toBe('2024-02-29');
	expect(previousFiscalYearEnd('2026-12-31', 'JANUARY')).toBe('2025-12-31');
	expect(previousFiscalYearEnd('2026-06-30', 'JULY')).toBe('2025-06-30');
	expect(shiftYears('2024-02-29', -1)).toBe('2023-02-28');
	expect(shiftYears('2026-12-31', -1)).toBe('2025-12-31');
	expect(defaultReportRange('2026-10-18', 'JANUARY')).toEqual({ from: '2026-01-01', to: '2026-10-31' });
	expect(defaultReportRange('2026-03-05', 'JULY')).toEqual({ from: '2025-07-01', to: '2026-03-31' });
	expect(defaultBalanceSheetAsOf('2026-10-18', 'JANUARY')).toBe('2026-10-31');
	expect(defaultBalanceSheetAsOf('2027-01-10', 'JANUARY')).toBe('2026-12-31');
	expect(defaultBalanceSheetAsOf('2026-07-03', 'JULY')).toBe('2026-06-30');
	expect(formatDateLong('2026-01-01')).toBe('1 Januari 2026');
	expect(formatPeriod('2026-01-01', '2026-12-31')).toBe('1 Januari 2026 – 31 Desember 2026');
});
```

  Test integrasi (`tests/integration/report-params.test.ts`):
  - `rangeParams(new URL('http://x/?from=2026-02-01&to=2026-01-01'), d, 'JANUARY')` melempar `{ code: 'invalid_range', status: 400 }`
  - `?as_of=2026-08-31` → `{ from: '2026-01-01', to: '2026-08-31' }`
  - tanpa query → `d`
  - `getCompanyReportInfo` mengembalikan nama dan `fiscalYear` dari `makeCompany`

- [ ] **Step 2: Jalankan dan pastikan gagal**
  Run: `bun test tests/unit/periods.test.ts tests/integration/report-params.test.ts`
  Expected: FAIL, module/export not found

- [ ] **Step 3: Implementasikan** sesuai Interfaces. Pakai aritmetika `Date.UTC` untuk tanggal, jangan zona lokal. Nama bulan: Januari … Desember.

- [ ] **Step 4: Jalankan lagi, termasuk test lama**
  Run: `bun test tests/unit/periods.test.ts tests/unit/balance-sheet.test.ts tests/integration/report-params.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit** `feat(app): period helpers and report range params`

---

### Task 2: Service Neraca Saldo berperiode

**Files:**
- Modify: `app/src/lib/server/reports/trial-balance.ts`
- Modify: `app/src/lib/server/reports/dashboard.ts` (panggilan `getTrialBalance`)
- Modify: `app/tests/integration/reports.test.ts` (test trial balance lama disesuaikan ke bentuk baru)
- Test: `app/tests/integration/trial-balance-period.test.ts`

**Interfaces:**
- Consumes: tidak ada dari Task 1, kecuali tipe tanggal string.
- Produces:

```ts
export interface TrialBalanceRow {
	accountId: string; code: string; name: string;
	openingDebit: string; openingCredit: string;   // saldo awal bersih, di satu sisi
	debit: string; credit: string;                 // mutasi bruto periode
	closingDebit: string; closingCredit: string;   // saldo akhir bersih, di satu sisi
}
export async function getTrialBalance(companyId: string, range: { from: string; to: string }): Promise<{
	from: string; to: string; rows: TrialBalanceRow[];
	totals: { openingDebit: string; openingCredit: string; debit: string; credit: string; closingDebit: string; closingCredit: string };
	balanced: boolean; // ketiga pasang total sama
}>
```

  - **Saldo awal (bersih):** baris jurnal dengan `entryDate < from`, atau `type = 'OPENING' AND entryDate <= to`.
  - **Mutasi:** jumlah `debit` dan jumlah `credit` dari jurnal `type <> 'OPENING'` dengan `from <= entryDate <= to`.
  - **Saldo akhir** = saldo awal bersih + debit − credit, ditaruh di sisi debit bila positif dan sisi kredit bila negatif.
  - Akun yang ketiganya nol tidak ditampilkan. Urut berdasarkan `code`.
  - Dashboard memanggil `getTrialBalance(companyId, { from: monthRange(today).from, to: today })`. Nilai `balanced` tidak bergantung pada `from`.

- [ ] **Step 1: Tulis test yang gagal** di `trial-balance-period.test.ts`, memakai pola `booksWithActivity` dari `reports.test.ts`: OPENING `2026-08-01` (bank 1.000.000 / modal), beban adm 30.000 tanggal `2026-08-02`, pendapatan 2.500.000 tanggal `2026-08-05`.
  - `test('opening journal dated on from goes to opening, not movement')`:
    - range `2026-08-01..2026-08-31`:
      - bank `1-1002`: `openingDebit` `1000000.00`, `debit` `2500000.00`, `credit` `30000.00`, `closingDebit` `3470000.00`
      - modal `3-1001`: `openingCredit` `1000000.00`, mutasi `0.00`/`0.00`
      - `totals.debit` = `totals.credit` = `2530000.00`
      - `balanced` true
  - `test('earlier movements roll into opening balance')`:
    - range `2026-08-03..2026-08-31`: beban `5-2010` `openingDebit` `30000.00`, mutasi nol, `closingDebit` `30000.00`
    - pendapatan `4-1001` mutasi `credit` `2500000.00`
  - `test('accounts with nothing in any column are hidden')`:
    - range `2026-07-01..2026-07-31`: hanya bank dan modal (dari OPENING) yang muncul
    - `rows.map(r=>r.code)` = `['1-1002','3-1001']`
  - Sesuaikan test lama di `reports.test.ts` ke `getTrialBalance(companyId, { from: '2026-01-01', to: '2026-08-31' })`, dengan assert di `closingDebit`/`closingCredit` dan `totals.closingDebit` `3500000.00`.

- [ ] **Step 2: Jalankan** `bun test tests/integration/trial-balance-period.test.ts tests/integration/reports.test.ts`. Expected: FAIL (bentuk lama)

- [ ] **Step 3: Implementasikan.** Satu query `GROUP BY` akun dengan `sum(CASE …)` untuk tiga agregat (saldo awal bersih, debit periode, kredit periode), dibatasi `entryDate <= to`. Lalu perbarui dashboard.

- [ ] **Step 4: Jalankan** `bun test tests/integration/trial-balance-period.test.ts tests/integration/reports.test.ts tests/integration/dashboard.test.ts`. Expected: PASS

- [ ] **Step 5: Commit** `feat(app): trial balance with opening, movement and closing columns`

---

### Task 3: Halaman dan API Neraca Saldo + `PeriodFilter`

**Files:**
- Create: `app/src/lib/components/PeriodFilter.svelte`
- Modify: `app/src/routes/(app)/trial-balance/+page.server.ts`, `+page.svelte`
- Modify: `app/src/routes/api/reports/trial-balance/+server.ts`
- Modify: `app/tests/e2e/datefield.spec.ts` (test kalender pindah ke `/balance-sheet?as_of=2026-08-15`, karena field "Per tanggal" tidak ada lagi di Neraca Saldo)
- Test: `app/tests/integration/trial-balance-period.test.ts` (tambah test API), `app/tests/e2e/period-reports.spec.ts`

**Interfaces:**
- Consumes: `rangeParams`, `getCompanyReportInfo`, `defaultReportRange`, `formatPeriod` (Task 1), dan `getTrialBalance` (Task 2).
- Produces: `PeriodFilter.svelte` dengan props `{ from: string; to: string; defaults: { from: string; to: string } }`.
  - Merender `<form method="GET" class="panel mb-5 flex flex-wrap items-end gap-3 p-4">` berisi dua `DateField` (`name="from"` aria-label "Dari", `name="to"` aria-label "Sampai") dan `FilterActions active={from !== defaults.from || to !== defaults.to}`.
  - Bila `from > to` saat submit: `preventDefault`, lalu tampilkan "Tanggal awal harus sebelum tanggal akhir" di bawah field Dari dengan `aria-invalid` (pola error `FormField`).
  - Halaman lain yang memakai komponen ini: Laba Rugi (Task 6).
- Page load mengembalikan `{ tb, defaults, companyName }`. API `GET` mengembalikan hasil `getTrialBalance` dan mendukung `from`/`to`/`as_of` seperti `rangeParams`.

- [ ] **Step 1: Tulis test yang gagal**
  - **Integrasi API** di `trial-balance-period.test.ts`:
    - `GET ?from=2026-08-01&to=2026-08-31` → 200, `body.totals.debit` `2530000.00`
    - `GET ?from=2026-09-01&to=2026-08-01` → 400, `body.error.code` `invalid_range`
    - `GET ?as_of=2026-08-31` → `body.from` `2026-01-01`
  - **E2E** `period-reports.spec.ts` (login admin seperti `datefield.spec.ts`), `test('trial balance uses a date range with opening, movement and closing columns')`:
    - goto `/trial-balance?from=2026-01-01&to=2026-12-31`
    - group "Dari" berisi `01`, group "Sampai" berisi `31`
    - columnheader `Saldo Awal`, `Mutasi`, `Saldo Akhir` terlihat
    - teks `Balance` (exact) terlihat
    - link Reset → URL `/trial-balance` tanpa `?`
  - **E2E** `test('a start date after the end date is blocked with a message')`:
    - goto `/trial-balance?from=2026-01-01&to=2026-01-31`, lalu ketik Dari = 2026-02-15 lewat segmen (pola di `datefield.spec.ts`)
    - klik Tampilkan → teks `Tanggal awal harus sebelum tanggal akhir` terlihat, URL tidak berubah

- [ ] **Step 2: Jalankan**
  Run: `bun test tests/integration/trial-balance-period.test.ts`, lalu `bunx playwright test tests/e2e/period-reports.spec.ts tests/e2e/datefield.spec.ts`
  Expected: FAIL

- [ ] **Step 3: Implementasikan**
  - **Header tabel dua baris:**
    - baris 1: Kode, Akun (`rowspan=2`), lalu `Saldo Awal` / `Mutasi` / `Saldo Akhir` masing-masing `colspan=2`
    - baris 2: Debit/Kredit ×3
  - **Isi:** sel bernilai `0.00` dikosongkan seperti sekarang. Baris `total-row` untuk enam kolom.
  - **Pembungkus:** `overflow-x-auto` di dalam panel.
  - **Deskripsi `PageHeader`:** `{companyName} · {formatPeriod(from, to)}`.
  - **Keadaan kosong:** "Belum ada saldo pada periode ini."
  - **Smoke:** `smoke.spec.ts` yang memakai `?as_of=` tetap jalan lewat kompatibilitas.

- [ ] **Step 4: Jalankan**
  Run: `bun test tests/integration/trial-balance-period.test.ts && bun run check`, lalu `bunx playwright test tests/e2e/period-reports.spec.ts tests/e2e/datefield.spec.ts tests/e2e/smoke.spec.ts`
  Expected: PASS, check 0 errors

- [ ] **Step 5: Commit** `feat(app): trial balance page with date range filter`

---

### Task 4: Posisi Keuangan dengan pembanding

**Files:**
- Modify: `app/src/lib/server/reports/balance-sheet.ts`
- Modify: `app/src/routes/(app)/balance-sheet/+page.server.ts`, `+page.svelte`
- Modify: `app/src/routes/api/reports/balance-sheet/+server.ts`
- Test: `app/tests/integration/balance-sheet.test.ts` (tambahan), `app/tests/e2e/period-reports.spec.ts` (tambahan)

**Interfaces:**
- Consumes: `previousFiscalYearEnd`, `defaultBalanceSheetAsOf`, `formatDateLong` (Task 1), dan `getCompanyReportInfo`.
- Produces:
  - `getBalanceSheet(companyId, asOf, opts?: { keep?: Set<string> })`
    - `keep` berisi key baris (`accountId ?? name`) yang harus tetap muncul walau bernilai nol
    - tanpa `opts`, perilakunya persis seperti sekarang
  - `getBalanceSheetComparative(companyId: string, asOf: string): Promise<{ current: BalanceSheetView; comparative: BalanceSheetView }>`
    - `comparative.asOf` = `previousFiscalYearEnd(asOf, fiscalYear)`
    - Langkahnya: hitung kedua laporan, kumpulkan key semua baris (rekursif, termasuk baris sintetis) yang muncul di salah satunya, lalu hitung ulang keduanya dengan `keep` = gabungan key itu. Hasilnya, pohon `current` dan `comparative` punya key dan urutan yang identik.
  - API `GET ?as_of` → `{ current, comparative }`. Page load → `{ current, comparative, defaultAsOf, companyName }`, dengan default `as_of` = `defaultBalanceSheetAsOf(todayIso(), fiscalYear)`.

- [ ] **Step 1: Tulis test yang gagal** di `balance-sheet.test.ts`:
  - `test('comparative column is the previous fiscal year end with identical row shape')`:
    - pakai `booksWithActivity()` (data Agustus 2026), lalu `getBalanceSheetComparative(companyId, '2026-12-31')`
    - `comparative.asOf` `2025-12-31`
    - `flat(current.equity.lines)` dan `flat(comparative.equity.lines)` punya key yang sama
    - semua nilai `comparative` = `0.00`
    - `current.balanced` dan `comparative.balanced` true
  - `test('comparative follows a non-January fiscal year')`:
    - company `fiscalYear` `JULY` (pola update yang dipakai test fiscal yang ada)
    - `getBalanceSheetComparative(companyId, '2026-08-31')` → `comparative.asOf` `2026-06-30`
  - `test('API returns current and comparative')`: `GET ?as_of=2026-12-31` → `body.current.asOf` `2026-12-31`, `body.comparative.asOf` `2025-12-31`
  - **E2E** `test('balance sheet shows a comparative column')`:
    - goto `/balance-sheet?as_of=2026-12-31`
    - columnheader `31 Desember 2026` dan `31 Desember 2025` terlihat
    - teks `JUMLAH ASET` terlihat

- [ ] **Step 2: Jalankan** `bun test tests/integration/balance-sheet.test.ts`. Expected: FAIL

- [ ] **Step 3: Implementasikan**
  - **Halaman:** tabel tiga kolom (Keterangan, tanggal berjalan, tanggal pembanding). Snippet `line`/`section`/`grandTotal` menerima pasangan baris yang di-zip berdasarkan indeks (bentuk pohon identik).
  - Format kurung negatif tetap dipakai.
  - **Badge `Balance`** = `current.balanced && comparative.balanced`. Pesan error tidak balance menyebut tanggal yang bermasalah.
  - **Deskripsi:** `{companyName} · Per {formatDateLong(asOf)} dan {formatDateLong(comparative.asOf)}`.
  - **Filter:** "Per tanggal" tetap. `active` = `asOf !== defaultAsOf`.
  - `overflow-x-auto` di panel.

- [ ] **Step 4: Jalankan**
  Run: `bun test tests/integration/balance-sheet.test.ts tests/integration/dashboard.test.ts && bun run check`, lalu `bunx playwright test tests/e2e/period-reports.spec.ts tests/e2e/datefield.spec.ts`
  Expected: PASS

- [ ] **Step 5: Commit** `feat(app): balance sheet comparative column`

---

### Task 5: Service Laba Rugi

**Files:**
- Create: `app/src/lib/server/reports/income-statement.ts`
- Test: `app/tests/integration/income-statement.test.ts`

**Interfaces:**
- Consumes: `shiftYears` (Task 1), `getBalanceSheet` (untuk test kesamaan).
- Produces:

```ts
export type IncomeSectionKey = 'revenue' | 'cogs' | 'opex' | 'otherIncome' | 'otherExpense' | 'tax';
export interface IncomeLine { accountId: string; code: string; name: string; amount: string }
export interface IncomeSection { key: IncomeSectionKey; title: string; lines: IncomeLine[]; total: string }
export interface IncomeStatementView {
	from: string; to: string;
	sections: IncomeSection[]; // selalu 6, urutan: revenue, cogs, opex, otherIncome, otherExpense, tax
	grossProfit: string; operatingProfit: string; profitBeforeTax: string; netProfit: string;
}
export async function getIncomeStatement(companyId: string, range: { from: string; to: string }, opts?: { keep?: Set<string> }): Promise<IncomeStatementView>;
export async function getIncomeStatementComparative(companyId: string, range: { from: string; to: string }): Promise<{ current: IncomeStatementView; comparative: IncomeStatementView }>;
```

  - **Judul seksi (exact):** `Pendapatan Usaha`, `Beban Pokok Pendapatan`, `Beban Operasional`, `Pendapatan Lain-lain`, `Beban Lain-lain`, `Beban Pajak Penghasilan`.
  - **Klasifikasi akun** (detail = akun tanpa anak; nilai = jurnal dengan `from <= entryDate <= to`, semua tipe jurnal termasuk OPENING):
    - Grup level-1 = leluhur yang induknya root. Bila akun itu sendiri root atau anak root, grupnya adalah akun itu sendiri.
    - EXPENSE dengan nama cocok `/pajak penghasilan/i` → `tax`
    - EXPENSE dengan kode grup cocok `/^\d+-1/` → `cogs`; `/^\d+-2/` → `opex`; selain itu → `otherExpense`
    - REVENUE dengan kode grup cocok `/^\d+-1/` → `revenue`; selain itu → `otherIncome`
  - **Nilai:** REVENUE = kredit − debit, EXPENSE = debit − kredit. Retur penjualan bisa negatif.
  - Baris disembunyikan bila nol, kecuali key-nya ada di `keep`.
  - **Subtotal:**
    - `grossProfit` = revenue − cogs
    - `operatingProfit` = grossProfit − opex
    - `profitBeforeTax` = operatingProfit + otherIncome − otherExpense
    - `netProfit` = profitBeforeTax − tax
  - **Pembanding:** range `{ from: shiftYears(from,-1), to: shiftYears(to,-1) }`, dengan `keep` = gabungan `accountId` dari kedua hasil, sehingga baris kedua kolom identik.

- [ ] **Step 1: Tulis test yang gagal** di `income-statement.test.ts`.
  - **Data dasar:** OPENING `2026-01-01` bank/modal 10.000.000. Satu upload dengan transaksi terkonfirmasi lalu `generateJournal`, memakai akun dari template default:
    - `4-1001` kredit 5.000.000 (2026-03-01)
    - `4-1003` debit 200.000 (retur, 2026-03-02)
    - `5-1001` debit 1.000.000
    - `5-2010` debit 300.000
    - `4-2001` kredit 50.000
    - `5-3003` debit 400.000
  - `test('PSAK sections and subtotals')`:
    - range `2026-01-01..2026-12-31`
    - judul keenam seksi berurutan
    - revenue.total `4800000.00`, dengan baris `4-1003` = `-200000.00`
    - cogs `1000000.00` → grossProfit `3800000.00`
    - opex `300000.00` → operatingProfit `3500000.00`
    - otherIncome `50000.00`, otherExpense `0.00` (seksi ada, `lines` kosong) → profitBeforeTax `3550000.00`
    - tax `400000.00` → netProfit `3150000.00`
  - `test('net profit equals balance sheet current-year profit')`: `getIncomeStatement(companyId, { from: '2026-01-01', to: '2026-08-31' }).netProfit` === `(await getBalanceSheet(companyId, '2026-08-31')).profit.thisYear`
  - `test('comparative is the same period one year earlier with identical rows')`:
    - `getIncomeStatementComparative(companyId, { from: '2026-01-01', to: '2026-12-31' })` → `comparative.from` `2025-01-01`, `comparative.to` `2025-12-31`
    - setiap seksi punya `lines.map(l=>l.accountId)` yang sama di kedua kolom
    - `comparative.netProfit` `0.00`
  - `test('non-January fiscal year: period is whatever range is passed')`: company `JULY`, range `2025-07-01..2026-06-30` memuat transaksi Maret 2026 → netProfit `3150000.00`

- [ ] **Step 2: Jalankan** `bun test tests/integration/income-statement.test.ts`. Expected: FAIL (module not found)

- [ ] **Step 3: Implementasikan** sesuai Interfaces. Pakai satu query `sum(debit)`/`sum(credit)` per akun dalam range, lalu klasifikasi di memori dengan peta akun perusahaan.

- [ ] **Step 4: Jalankan** `bun test tests/integration/income-statement.test.ts`. Expected: PASS

- [ ] **Step 5: Commit** `feat(app): income statement service (PSAK vertical, comparative)`

---

### Task 6: Halaman, API, dan menu Laba Rugi

**Files:**
- Create: `app/src/routes/(app)/income-statement/+page.server.ts`, `+page.svelte`
- Create: `app/src/routes/api/reports/income-statement/+server.ts`
- Modify: `app/src/lib/nav.ts` (item `{ label: 'Laba Rugi', href: '/income-statement', min: 'viewer', icon: 'income' }` sebelum Posisi Keuangan di grup "Laporan Keuangan")
- Modify: `app/src/lib/components/AppSidebar.svelte` (ikon `income` → `@lucide/svelte/icons/trending-up`)
- Test: `app/tests/integration/income-statement.test.ts` (API + RBAC), `app/tests/e2e/period-reports.spec.ts`

**Interfaces:**
- Consumes: `PeriodFilter` (Task 3), `getIncomeStatementComparative` (Task 5), `rangeParams`, `defaultReportRange`, `getCompanyReportInfo`, `formatPeriod` (Task 1).
- Produces:
  - API `GET /api/reports/income-statement?from&to` → `{ current, comparative }`. Peran `viewer`, tanpa sesi → 401, `invalid_range` → 400.
  - Page load → `{ current, comparative, defaults, companyName }`.

- [ ] **Step 1: Tulis test yang gagal**
  - **Integrasi:** 401 tanpa ctx; 200 untuk viewer dengan `body.current.netProfit` `3150000.00`; 400 untuk `from > to`.
  - **E2E** `test('income statement shows PSAK sections with a comparative period')`:
    - goto `/income-statement?from=2026-01-01&to=2026-12-31`
    - link sidebar `Laba Rugi` terlihat
    - teks `Pendapatan Usaha`, `Laba Kotor`, `Laba Usaha`, `Laba Sebelum Pajak`, `Laba Bersih` terlihat
    - columnheader berisi `2026` dan `2025`
    - Reset → `/income-statement`

- [ ] **Step 2: Jalankan**
  Run: `bun test tests/integration/income-statement.test.ts`, lalu `bunx playwright test tests/e2e/period-reports.spec.ts`
  Expected: FAIL

- [ ] **Step 3: Implementasikan**
  - **Halaman** bergaya Posisi Keuangan: tabel Keterangan | periode berjalan | periode pembanding.
    - Header kolom memakai `formatPeriod` versi singkat (`formatDateLong` untuk kedua ujung boleh dipecah dua baris).
    - Tiap seksi: judul seksi (`bg-pale/60`), baris akun `code name`, lalu "Jumlah {title}".
    - Seksi kosong menampilkan "—" dengan jumlah 0.
  - **Baris subtotal** (`font-semibold`): Laba Kotor setelah cogs, Laba Usaha setelah opex, Laba Sebelum Pajak setelah otherExpense, dan **Laba Bersih** sebagai `total-row`.
  - Negatif dalam kurung (fungsi `amount` yang sama dengan Posisi Keuangan; pindahkan ke `$lib/money.ts` sebagai `formatAccounting` bila dipakai ≥2 halaman).
  - **Deskripsi:** `{companyName} · {formatPeriod(from,to)}`.
  - `overflow-x-auto`.

- [ ] **Step 4: Jalankan semua**
  Run: `bun run test && bun run check && bun run build && bunx playwright test`
  Expected: semua PASS, check 0 errors, build sukses

- [ ] **Step 5: Commit** `feat(app): income statement page, API and sidebar entry`
