# Brand pena, Breadcrumb, Chart Dashboard, Favicon, Halaman Error — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi berganti brand menjadi **pena** (logo "P", favicon, tagline), punya breadcrumb di setiap halaman, tiga chart dashboard yang angkanya sama dengan laporan, serta halaman 404/500 bergaya brand.

**Architecture:**
- **Brand:** `PageHeader` menjadi pusat judul tab dan breadcrumb. Breadcrumb dihitung oleh fungsi murni `buildBreadcrumb(pathname, nav, crumb?)` di `$lib/breadcrumb.ts`.
- **Chart:** data dihitung server di `reports/dashboard.ts` dengan aturan yang sama dengan `income-statement.ts`, lalu digambar oleh komponen SVG di `$lib/components/charts/`.
- **Error:** dua `+error.svelte` (root dan dalam grup `(app)`), ditambah `src/error.html` dan `handleError`.

**Tech Stack:** SvelteKit + Svelte 5 runes, Tailwind v4, bits-ui, Bun, Drizzle/Postgres, bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-pena-brand-breadcrumb-charts-errors-design.md`

## Global Constraints
- Tidak ada dependensi baru.
- Uang memakai `D`/`sumMoney`/`toMoney`/`formatAccounting`/`formatIdr`/`formatIdrShort` (`src/lib/money.ts`). Hari ini memakai `todayIso()`. Teks UI dalam Bahasa Indonesia.
- **Brand:**
  - Ditulis huruf kecil **`pena`**. Wordmark: `pena.`
  - Tagline exact: **`Pembukuan Keuangan Online Gratis`**.
  - Judul tab: `{judul} · pena`. Login: `Masuk · pena — Pembukuan Keuangan Online Gratis`.
- **Jangan ubah:** key `localStorage` `jk-theme`/`jk-sidebar`, nama cookie, email seed `admin@jurnalku.local`, nama DB/repo/paket.
- **Tema dan layout:** tema terang/gelap memakai token CSS yang ada (`--green`, `--deep`, `--lime-2`, `--destructive`, `--ink`, `--muted-foreground`, `--chart-*` di `src/app.css`). Di layar 390px tidak boleh ada scroll horizontal halaman.
- **Test e2e:** teks yang memakai "Jurnalku" diperbarui ke brand baru. Teks e2e lain tidak berubah.
- Commit diakhiri `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Perintah dijalankan dari `app/`.

## Review Focus
1. **Konsistensi angka chart Laba Rugi.** Laba bersih bulan apa pun di chart harus sama dengan `getIncomeStatement` untuk bulan itu, termasuk jurnal OPENING di bulan itu, jurnal CLOSING (diabaikan), dan tahun buku non-Januari. Ditest di Task 4.
2. **Route tak dikenal dan entitas tak ada.** `/tidak-ada` dan `/uploads/<uuid acak>` menampilkan halaman 404 bergaya brand tanpa stack trace. Error di dalam aplikasi tetap menampilkan sidebar. Ditest di Task 3.
3. **Breadcrumb untuk path yang tidak ada di NAV** (mis. `/profile`, `/uploads/[id]`, `/settings/company?new=1`). Breadcrumb tidak boleh kosong atau salah. Hasilnya `Dashboard / …` dengan item terakhir benar. Ditest di Task 2.
4. **Dashboard perusahaan baru tanpa jurnal dan tanpa akun bank.** Tidak error. Chart menampilkan keadaan kosong, dan kartu tren bank tidak tampil. Ditest di Task 4 dan 5.
5. **Donut dengan akun bernilai negatif** (retur penjualan) atau lebih dari lima akun. Hanya akun positif yang tampil, irisan maksimal lima ditambah "Lainnya", dan total tengah = jumlah irisan. Ditest di Task 4.

---

### Task 1: Rebrand pena, favicon, dan judul tab terpusat

**Files:**
- Modify: `app/src/app.html`
  - `<title>pena</title>`
  - `<meta name="description" content="pena — Pembukuan Keuangan Online Gratis">`
  - `<meta name="theme-color" content="#6bad40">`
  - link favicon (svg, png 32, apple-touch-icon)
- Create: `app/static/favicon.svg`, `app/static/favicon-32.png`, `app/static/apple-touch-icon.png`
- Create: `app/scripts/render-favicons.ts` (skrip sekali jalan memakai `playwright` dari devDependencies untuk merender SVG ke PNG). PNG hasilnya di-commit.
- Modify: `app/src/lib/components/PageHeader.svelte` (render `<svelte:head><title>{title} · pena</title></svelte:head>`)
- Modify:
  - `app/src/lib/components/AppSidebar.svelte`: tile `P`, wordmark `pena.`, `aria-label="pena"`, `title="pena — Pembukuan Keuangan Online Gratis"`
  - `AppFooter.svelte`: `© 2026 pena`
  - `ConfirmLogoutDialog.svelte`: `Keluar dari pena?`
  - `src/routes/login/+page.svelte`: wordmark `pena.`, tagline di bawahnya, `<svelte:head>` dengan judul login
  - `src/routes/(app)/settings/opening-balance/+page.svelte`: deskripsi "…mulai pembukuan di pena…"
  - `src/routes/(app)/profile/+page.svelte`: hapus `<svelte:head>` lokal (judul dari PageHeader)
  - `src/routes/(app)/dashboard/+page.svelte`: judul `Dashboard · pena`. Dashboard belum memakai PageHeader dan akan diubah di Task 5. Untuk sekarang cukup ganti teks judulnya.
- Modify tests: `tests/e2e/fixed-chrome.spec.ts` (logo `/pena/`, footer `© 2026 pena`), `tests/e2e/logout-confirm.spec.ts` (`Keluar dari pena?`)
- Test: `app/tests/e2e/brand.spec.ts`

- [ ] **Step 1: Tulis e2e yang gagal** `brand.spec.ts`:
  - `test('login shows the pena brand, tagline and favicon')`:
    - `/login` → teks `pena.` dan `Pembukuan Keuangan Online Gratis` terlihat
    - `page` title = `Masuk · pena — Pembukuan Keuangan Online Gratis`
    - `link[rel="icon"][type="image/svg+xml"]` ber-href `/favicon.svg`
    - `request.get('/favicon.svg')` → 200 `image/svg+xml`
    - `/favicon-32.png` dan `/apple-touch-icon.png` → 200 `image/png`
  - `test('app pages use "{title} · pena" and no visible Jurnalku remains')`:
    - login admin
    - `/trial-balance` → title `Neraca Saldo · pena`
    - `/dashboard` → title `Dashboard · pena`
    - `page.locator('body')` tidak mengandung teks `Jurnalku` di `/dashboard`, `/settings/opening-balance`, `/profile`
    - link logo bernama `pena` dengan tile berisi `P`
- [ ] **Step 2:** `bunx playwright test tests/e2e/brand.spec.ts`. Expected: FAIL
- [ ] **Step 3: Implementasikan.**
  - **Isi `favicon.svg`:** viewBox `0 0 64 64`, `rect` rx 14 isi gradien `#6bad40`→`#3f7d2a`, huruf `P` putih font-weight 900, font sistem sans-serif, ditengah. Jalankan skrip render, lalu cek ukuran PNG 32×32 dan 180×180.
  - **Grep akhir:** `grep -rn "Jurnalku" src` harus kosong, kecuali komentar kode.
- [ ] **Step 4:** `bun run test && bun run check`, lalu `bunx playwright test tests/e2e/brand.spec.ts tests/e2e/fixed-chrome.spec.ts tests/e2e/logout-confirm.spec.ts`. Expected: PASS
- [ ] **Step 5: Commit** `feat(app): rebrand to pena with P logo, tagline and favicon`

---

### Task 2: Breadcrumb

**Files:**
- Create: `app/src/lib/breadcrumb.ts`
- Create: `app/src/lib/components/Breadcrumb.svelte`
- Modify: `app/src/lib/components/PageHeader.svelte` (prop opsional `crumb?: string`, merender `Breadcrumb` di atas judul, kecuali di `/dashboard`)
- Modify: `app/src/routes/(app)/uploads/[id]/+page.svelte` (`crumb={upload.filename}`)
- Test: `app/tests/unit/breadcrumb.test.ts`, `app/tests/e2e/breadcrumb.spec.ts`

**Interfaces:**
- Consumes: `NAV`, `NavGroup` dari `$lib/nav`.
- Produces:

```ts
export interface Crumb { label: string; href?: string } // tanpa href = teks (grup / halaman aktif)
export function buildBreadcrumb(pathname: string, nav: NavGroup[], crumb?: string): Crumb[];
```

- **Aturan `buildBreadcrumb`:**
  - Elemen pertama selalu `{ label: 'Dashboard', href: '/dashboard' }`.
  - Cari item NAV dengan kecocokan **terpanjang**: `pathname === href` atau `pathname.startsWith(href + '/')`. Tujuannya supaya `/uploads/new` cocok ke "Upload Baru", bukan "Riwayat Upload".
  - Bila grup item punya `label`, tambahkan `{ label: group.label }` tanpa href.
  - Bila `pathname === item.href` dan tidak ada `crumb`, item ditambahkan tanpa href (halaman aktif). Bila ada `crumb`, item diberi href lalu `{ label: crumb }` ditambahkan.
  - `/dashboard` → `[{ label: 'Dashboard' }]`.
  - `/profile` (tidak ada di NAV) → `[Dashboard(link), { label: 'Profil Saya' }]`. Tabel `EXTRA = { '/profile': 'Profil Saya' }` ada di file yang sama.
  - Path lain yang tidak dikenal → `[Dashboard(link)]` plus `crumb` bila ada.
- **`Breadcrumb.svelte`:**
  - Struktur: `<nav aria-label="Breadcrumb"><ol class="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">`
  - Pemisah: ikon `ChevronRight` (`aria-hidden`).
  - Item terakhir: `aria-current="page"`, `text-ink`, `truncate`. Item tengah: `truncate max-w-[10rem]`. Link memakai hover `text-deep`.

- [ ] **Step 1: Tulis test yang gagal.**
  - **Unit:**
    - `/income-statement` → labels `['Dashboard','Laporan Keuangan','Laba Rugi']`, href hanya di Dashboard
    - `/settings/closing` → `['Dashboard','Pengaturan','Tutup Buku']`
    - `/review` → `['Dashboard','Review & Konfirmasi']` (grup tanpa label)
    - `/uploads/new` → `['Dashboard','eStatement','Upload Baru']`
    - `/uploads/abc` dengan crumb `'BCA Jan.pdf'` → `['Dashboard','eStatement','Riwayat Upload','BCA Jan.pdf']`, dengan `Riwayat Upload` ber-href `/uploads`
    - `/profile` → `['Dashboard','Profil Saya']`
    - `/dashboard` → `['Dashboard']`
    - `/tidak-dikenal` → `['Dashboard']`
  - **E2E:**
    - `/income-statement`: `getByRole('navigation', { name: 'Breadcrumb' })` berisi `Laporan Keuangan` dan `Laba Rugi`, item `aria-current="page"` = `Laba Rugi`, klik `Dashboard` → URL `/dashboard`
    - `/dashboard`: tidak ada navigation Breadcrumb
    - viewport 390: `/settings/opening-balance` tanpa scroll horizontal halaman
- [ ] **Step 2:** `bun test tests/unit/breadcrumb.test.ts`. Expected: FAIL
- [ ] **Step 3:** Implementasikan. `PageHeader` membaca `page.url.pathname` dari `$app/state`.
- [ ] **Step 4:** `bun test tests/unit/breadcrumb.test.ts && bun run check`, lalu `bunx playwright test tests/e2e/breadcrumb.spec.ts`. Expected: PASS
- [ ] **Step 5: Commit** `feat(app): breadcrumb on every page`

---

### Task 3: Halaman 404/500

**Files:**
- Create: `app/src/lib/components/ErrorView.svelte` (isi bersama kedua halaman error)
- Create: `app/src/routes/+error.svelte` (berdiri sendiri: logo tile `P` + `pena.` di atas, `ErrorView` di tengah, latar mengikuti tema)
- Create: `app/src/routes/(app)/+error.svelte` (`ErrorView` di dalam shell aplikasi)
- Create: `app/src/error.html`
- Modify: `app/src/hooks.server.ts` (tambah `handleError`)
- Create: `app/src/lib/error-copy.ts`
- Test: `app/tests/unit/error-copy.test.ts`, `app/tests/e2e/error-pages.spec.ts`

**Interfaces:**
- Produces:

```ts
export function errorCopy(status: number, message?: string): { title: string; body: string; showReload: boolean };
```

  | Status | `title` | `body` | `showReload` |
  |---|---|---|---|
  | 404 | `Halaman tidak ditemukan` | `Halaman yang Anda cari tidak ada atau sudah dipindahkan.` | false |
  | ≥500 | `Terjadi kesalahan` | `Maaf, ada masalah di server. Coba lagi beberapa saat lagi.` | true |
  | 403 | `Akses ditolak` | `message ?? 'Anda tidak punya akses ke halaman ini.'` | false |
  | 400 | `Permintaan tidak valid` | `message ?? 'Periksa kembali isian Anda.'` | false |
  | lainnya | `Terjadi kesalahan` | `message ?? 'Silakan coba lagi.'` | false |

- **`ErrorView` props:** `{ status: number; message?: string }`.
  - Merender kode status besar (`aria-hidden`), `<h1>{title}</h1>`, dan `<p>{body}</p>`.
  - Tombol `Kembali ke Dashboard` (link `/dashboard`), ditambah tombol `Muat ulang` (`location.reload()`) bila `showReload`.
  - `<svelte:head><title>{status === 404 ? '404' : title} · pena</title></svelte:head>`
- **`handleError`:** `console.error(error)` lalu return `{ message: 'Terjadi kesalahan di server' }`.
- **`error.html`:** HTML statis dengan style inline (latar gelap netral, teks putih), berisi `pena`, `Terjadi kesalahan`, `%sveltekit.status%`, dan link `Kembali` ke `/`.

- [ ] **Step 1: Tulis test yang gagal.**
  - **Unit:** baris-baris tabel di atas, termasuk 500 tanpa message (tetap teks generik walau message diberikan).
  - **E2E:**
    - Belum login, `/halaman-tidak-ada` → status 404, heading `Halaman tidak ditemukan`, link `Kembali ke Dashboard`, title `404 · pena`, tidak ada teks `Error:`/`at `.
    - Login, `/uploads/00000000-0000-4000-8000-000000000000` → heading `Halaman tidak ditemukan` atau teks 404 yang sesuai (pesan `notFound` dari service) **dan** sidebar (`navigation` `Menu utama`) tetap terlihat.
    - Login, `/halaman-tidak-ada` → 404 bergaya brand (root error).
- [ ] **Step 2:** `bun test tests/unit/error-copy.test.ts`. Expected: FAIL
- [ ] **Step 3: Implementasikan.** Status dan pesan dibaca dari `page.status` / `page.error?.message` (`$app/state`).
  - Untuk 404 dari service, `withPageErrors` meneruskan pesan seperti "Upload tidak ditemukan". Tampilkan judul 404 standar, lalu pesan service sebagai body bila ada. Jadi `errorCopy(404, message)` memakai `message` sebagai body bila diberikan. **Revisi tabel:** baris 404 memakai `body = message ?? 'Halaman yang Anda cari tidak ada atau sudah dipindahkan.'`. Unit test mengikuti revisi ini.
- [ ] **Step 4:** `bun test tests/unit/error-copy.test.ts && bun run check && bun run build`, lalu `bunx playwright test tests/e2e/error-pages.spec.ts`. Expected: PASS
- [ ] **Step 5: Commit** `feat(app): branded 404 and 500 pages`

---

### Task 4: Data chart dashboard

**Files:**
- Modify: `app/src/lib/server/reports/dashboard.ts`
- Test: `app/tests/integration/dashboard-charts.test.ts` (dan sesuaikan `tests/integration/dashboard.test.ts` bila memakai field `monthly`)

**Interfaces:**
- Consumes: `fiscalYearStart`, `fiscalYearEnd` (`$lib/periods`), `getCompanyReportInfo`, dan aturan sumber dari `reports/income-statement.ts`:
  - hanya akun detail REVENUE/EXPENSE
  - semua tipe jurnal kecuali `CLOSING`
  - pendapatan = kredit − debit, beban = debit − kredit
- Produces (field baru di `DashboardView`; field `monthly` dihapus):

```ts
profitLoss: Array<{ month: string /* 'YYYY-MM' */; revenue: string; expense: string; netProfit: string; future: boolean }>; // 12 bulan tahun buku yang memuat today
composition: {
	expense: { slices: Array<{ accountId: string | null; name: string; amount: string; percent: number }>; total: string }; // top 5 + 'Lainnya' (accountId null)
	revenue: { slices: …same…; total: string };
};
bankTrend: Array<{ month: string; balance: string }> | null; // 12 bulan terakhir s.d. bulan berjalan; null bila akun bank belum diatur
```

- **Aturan:**
  - `profitLoss`:
    - bulan setelah bulan berjalan → `future: true`, nilai `0.00`
    - `revenue` dan `expense` adalah total seksi (bisa negatif bila retur lebih besar)
    - `netProfit = revenue − expense`
  - `composition` (rentang `[fiscalYearStart(today), today]`):
    - hanya akun dengan nilai > 0, diurutkan menurun
    - lima teratas jadi irisan, sisanya dijumlah ke `{ accountId: null, name: 'Lainnya' }` bila > 0
    - `total = sum(slices)`
    - `percent` dibulatkan 1 desimal (`Number`), dan jumlahnya boleh tidak tepat 100
  - `bankTrend`: saldo kumulatif akun bank sampai akhir tiap bulan (bulan berjalan sampai `today`), semua tipe jurnal.
  - **Efisiensi:** satu query bergrup per bulan dan akun untuk P&L tahun buku (dipakai untuk `profitLoss` dan `composition`), serta satu query untuk tren bank.

- [ ] **Step 1: Tulis test yang gagal.** Pakai fixture yang sama dengan `tests/integration/income-statement.test.ts`: OPENING 2026-01-01; transaksi Maret 2026 dengan `4-1001` 5.000.000, `4-1003` −200.000, `5-1001` 1.000.000, `5-2010` 300.000, `4-2001` 50.000, `5-3003` 400.000. `today = '2026-10-18'`.
  - `test('profitLoss months match the income statement')`:
    - 12 bulan `2026-01`..`2026-12`
    - `future` true untuk `2026-11`, `2026-12`
    - untuk setiap bulan yang tidak `future`, `netProfit` = `getIncomeStatement(companyId,{from: awal, to: akhir bulan}).netProfit`
    - Maret: revenue `4850000.00`, expense `1700000.00`, netProfit `3150000.00`
  - `test('profitLoss follows a non-January fiscal year and ignores closing journals')`:
    - company `fiscalYear` `APRIL`, `today = '2026-10-18'` → bulan pertama `2026-04`, terakhir `2027-03`
    - tambahkan jurnal CLOSING manual bertanggal di tahun itu (pakai helper `insertClosing` dari `tests/integration/closing-reports.test.ts` atau salin) → nilai tidak berubah
  - `test('composition keeps positive accounts, top five plus Lainnya')`:
    - expense slices: `5-1001` (1000000.00), `5-3003` (400000.00), `5-2010` (300000.00), total `1700000.00`
    - revenue: `4-1003` tidak ada (negatif), slices `4-1001` dan `4-2001`, total `5050000.00`
    - tambahkan enam akun beban lain bernilai kecil → tepat 5 irisan + `Lainnya`, `total` = jumlah irisan
  - `test('bankTrend is cumulative month-end balance and null without a bank account')`:
    - 12 elemen berakhir `2026-10`, saldo Maret = saldo setelah transaksi Maret
    - perusahaan dengan `bankAccountId` null → `bankTrend` null
  - `test('empty company dashboard does not fail')`: perusahaan baru → `profitLoss` 12 bulan bernilai 0, slices kosong
- [ ] **Step 2:** `bun test tests/integration/dashboard-charts.test.ts`. Expected: FAIL
- [ ] **Step 3:** Implementasikan. Hapus `monthlyFlows` dan `lastSixMonths` bila tidak dipakai lagi.
- [ ] **Step 4:** `bun test tests/integration/dashboard-charts.test.ts tests/integration/dashboard.test.ts && bun run check`. Expected: PASS. `check` boleh gagal hanya di `dashboard/+page.svelte` yang masih memakai `monthly`. Bila begitu, perbaiki minimal (hapus pemakaian StatBars) agar check bersih. UI lengkap ada di Task 5.
- [ ] **Step 5: Commit** `feat(app): dashboard chart data matching the income statement`

---

### Task 5: Komponen chart dan dashboard baru

**Files:**
- Create: `app/src/lib/components/charts/ProfitLossChart.svelte`, `DonutChart.svelte`, `TrendLine.svelte`
- Create: `app/src/lib/charts.ts` (perhitungan geometri murni: skala, path arc donut, path garis)
- Modify: `app/src/routes/(app)/dashboard/+page.svelte` (pakai `PageHeader title="Dashboard" description="Ringkasan pembukuan {companyName}"`, susun chart)
- Delete bila tak terpakai: `app/src/lib/components/dashboard/StatBars.svelte`, `app/src/lib/stat-bars.ts` dan test-nya (ikut dihapus bila ada)
- Test: `app/tests/unit/charts.test.ts`, `app/tests/e2e/dashboard-charts.spec.ts`

**Interfaces:**
- Consumes: `profitLoss`, `composition`, `bankTrend`, `profitThisYear`, `balanced`, `fiscalYearStart` (Task 4).
- Produces (`$lib/charts.ts`):
  - `niceMax(values: number[]): number`: batas atas sumbu dibulatkan, minimal 1
  - `barGeometry(values, height, max): {y, h}[]`: nilai negatif digambar dari garis nol ke bawah; `max` dihitung dari nilai absolut
  - `donutArcs(values: number[], r: number, inner: number): string[]`: path SVG per irisan; satu irisan 100% tetap tergambar sebagai lingkaran penuh
  - `linePath(values: number[], width: number, height: number): string`
- **Tata letak dashboard:**
  1. `PageHeader`
  2. Grid kartu (Bank, Review, Upload) seperti sekarang
  3. Kartu **Laba Rugi** lebar penuh:
     - judul "Laba Rugi", subjudul "Tahun buku {formatPeriod(start,end)}"
     - di kanan: angka Laba tahun berjalan besar (warna hijau/destruktif) dan tag `Balance ✓` / `Tidak balance` (pertahankan teks exact)
     - lalu `ProfitLossChart`
  4. Grid dua kolom (lg): **Komposisi** (`DonutChart` + toggle `Beban` | `Pendapatan` berupa dua tombol `role="radio"` dalam `role="radiogroup"` `aria-label="Jenis komposisi"`) dan **Tren saldo bank** (`TrendLine`, hanya bila `bankTrend`)
  5. Transaksi terbaru dan Aksi seperti sekarang
- **`ProfitLossChart`:**
  - SVG responsif (`viewBox`, `width=100%`)
  - per bulan dua batang (pendapatan `var(--green)`, beban `var(--destructive)` 70% opacity) dan garis laba (`var(--ink)`) dengan titik
  - label bulan `Jan`..`Des` (`Jan 26` bila melintasi tahun)
  - grup bulan non-future berupa `<a href="/income-statement?from=…&to=…">` yang fokusable, dengan `aria-label="{Bulan} {tahun}: pendapatan Rp…, beban Rp…, laba Rp…"`
  - tooltip muncul saat hover/fokus
  - `role="img"` `aria-label` ringkasan untuk SVG keseluruhan
  - tabel `sr-only`
  - legenda: Pendapatan, Beban, Laba bersih
  - keadaan kosong (semua 0): teks `Belum ada jurnal di tahun buku ini`
- **`DonutChart`:**
  - irisan memakai palet `var(--chart-1)`..`var(--chart-5)`, "Lainnya" `var(--muted-foreground)` 40%
  - tengah: total (`formatIdrShort`) dan label `Total beban` / `Total pendapatan`
  - legenda: nama, `formatIdr`, persen
  - keadaan kosong: `Belum ada beban di tahun buku ini` / `Belum ada pendapatan di tahun buku ini`
  - Bila `--chart-2..5` belum ada di `app.css`, tambahkan untuk terang dan gelap sebagai variasi hijau/teal.
- **`TrendLine`:** garis area tipis (`var(--green)`), label bulan pertama dan terakhir, saldo terakhir besar di atas (`formatIdr`).

- [ ] **Step 1: Tulis test yang gagal.**
  - **Unit `charts.test.ts`:**
    - `niceMax([0,0]) === 1`
    - `niceMax([1234567]) >= 1234567`
    - `barGeometry([100,-50],100,100)`: batang negatif `y` = garis nol dan `h > 0`
    - `donutArcs([1],50,30)` menghasilkan 1 path non-kosong
    - `donutArcs([1,1],…)` → 2 path
    - `linePath([1,2,3],100,50)` diawali `M`
  - **E2E `dashboard-charts.spec.ts`** (login admin, `/dashboard`):
    - `getByRole('img', { name: /Laba Rugi/ })` terlihat atau teks `Belum ada jurnal di tahun buku ini` terlihat
    - radiogroup `Jenis komposisi`: klik `Pendapatan` → `aria-checked="true"` dan judul tengah berganti ke `Total pendapatan` atau keadaan kosong pendapatan
    - title `Dashboard · pena`
    - viewport 390: tidak ada scroll horizontal halaman
    - bila ada link bulan (`a[href^="/income-statement?from="]`), klik yang pertama → URL `/income-statement?from=`
- [ ] **Step 2:** `bun test tests/unit/charts.test.ts`. Expected: FAIL
- [ ] **Step 3:** Implementasikan. Svelte 5: state toggle `$state('expense')`.
- [ ] **Step 4:** `bun run test && bun run check && bun run build && bunx playwright test` (jalankan playwright dua kali). Expected: semua PASS
- [ ] **Step 5: Commit** `feat(app): profit & loss, composition and bank trend charts on the dashboard`
