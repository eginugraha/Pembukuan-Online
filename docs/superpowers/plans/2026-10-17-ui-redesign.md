# Redesign UI "Modern 3D Dashboard" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terapkan gaya dashboard modern bergaya 3D (struktur `1.webp`, warna `2.webp`) ke seluruh aplikasi Jurnalku, dan rombak dashboard dengan data sungguhan.

**Architecture:** Tema dipusatkan di token CSS shadcn (`src/app.css`) dan varian komponen `src/lib/components/ui/*`, ditambah beberapa kelas utilitas tema (`panel`, `tile-3d`, `glow`). Shell baru di `(app)/+layout.svelte` dengan sidebar ber-ikon dan top bar. Data dashboard berasal dari dua modul server baru, `reports/dashboard.ts` dan `dashboard/next-step.ts`, yang punya test integrasi. Halaman lain hanya diubah markup dan kelasnya; logikanya tidak disentuh.

**Tech Stack:** SvelteKit + Svelte 5 runes, Tailwind v4, shadcn-svelte, `@lucide/svelte`, Drizzle, bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-ui-redesign-design.md`. Mockup acuan: `.superpowers/brainstorm/20643-1792173491/content/dashboard-v2.html`.

## Global Constraints

- Palet: canvas `#DEE1E7`, lime `#C0F497`, lime-2 `#A8E57C`, green `#6BAD40`, deep `#3E6E1C`, pale `#F2FFEF`, ink `#14210F`. Merah tetap memakai `--destructive`.
- Font: `@fontsource-variable/plus-jakarta-sans`, dengan fallback `'Inter Variable'`.
- Dilarang ada kontrol palsu: tidak ada search, notifikasi, atau link yang tidak berfungsi.
- Tidak ada lagi kelas warna `slate|blue|gray` hardcoded di `src/routes` dan `src/lib/components`, kecuali di `src/lib/components/ui`.
- Teks yang dipakai e2e tidak boleh berubah: label `Email`/`Password`, tombol `Masuk`, `Unggah`, `Konfirmasi semua saran…`, `Generate Jurnal`, teks `Perlu review`, `Tidak ada transaksi yang menunggu konfirmasi.`, `N jurnal dibuat`, dan badge `Balance` (exact) di Neraca Saldo.
- Bahasa UI Indonesia. Di bawah `lg`, sidebar menjadi drawer, gutter 16px, tanpa scroll horizontal di level halaman.
- Dark mode di luar cakupan.

## Review Focus

- Perusahaan baru tanpa data apa pun: dashboard tidak error, semua kartu menampilkan keadaan kosong yang mengarahkan ke Upload atau Saldo Awal. Dites di Task 2.
- Akun bank perusahaan belum diatur (`bankAccountId = null`): `bank` bernilai `null`, kartu menampilkan ajakan. Dites di Task 2.
- Role viewer: tidak menerima aksi menuju halaman yang butuh accountant/admin, baik di `actions` maupun di `nextStep`. Dites di Task 2.
- Bulan tanpa transaksi di tengah rentang 6 bulan tetap muncul dengan nilai `0.00`, sehingga grafik tidak bergeser. Dites di Task 2.
- Teks panjang (nama perusahaan, keterangan transaksi) di layar 390px: harus terpotong dengan `truncate` dan tidak memecah layout. Dicek visual di Task 7.

---

### Task 1: Fondasi tema (token, font, komponen dasar)

**Files:**
- Modify: `app/package.json` (tambah `@fontsource-variable/plus-jakarta-sans`), `app/src/app.css`, `app/src/lib/ui.ts`
- Modify: `app/src/lib/components/ui/{button,card,badge,input,table,dialog,alert}/*.svelte`, `app/src/lib/components/PageHeader.svelte`, `app/src/lib/components/StatusBadge.svelte`
- Test: `app/tests/unit/theme.test.ts`

**Interfaces:**
- Produces:
  - Token Tailwind: `bg-canvas`, `bg-lime`, `bg-lime-2`, `text-green`/`bg-green`, `text-deep`/`bg-deep`, `bg-pale`, `text-ink`. Dibuat lewat `--color-*` di `@theme inline`.
  - Kelas utilitas di `app.css`:
    - `.panel`: permukaan putih, `rounded-[20px]`, bayangan lembut.
    - `.tile-3d`: kotak ikon bergradien dengan highlight inset dan bayangan berwarna. Varian `.tile-3d-lime`, `.tile-3d-deep`, `.tile-3d-amber`, `.tile-3d-red`, `.tile-3d-muted`.
    - `.glow`: pseudo-element blur di bawah elemen, warna mengikuti `background`.
  - Varian `Badge` baru: `success`, `warning`, `muted` (selain yang sudah ada).
  - Varian `Button` `default` menjadi deep/gradien hijau dengan bayangan berwarna.

- [ ] **Step 1: Tulis test token tema yang gagal.** `tests/unit/theme.test.ts` membaca `src/app.css` sebagai teks dan memastikan string berikut ada: `#c0f497`, `#3e6e1c`, `#6bad40`, `#f2ffef`, `#dee1e7`, `--color-lime`, `--color-deep`, `.tile-3d`, `.panel`, `Plus Jakarta Sans`. Pencocokan case-insensitive.
- [ ] **Step 2:** Jalankan `cd app && bun test tests/unit/theme.test.ts`. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Pasang font dengan `bun add @fontsource-variable/plus-jakarta-sans`. Di `app.css`:
  - import font tersebut
  - set `--font-sans: 'Plus Jakarta Sans Variable', 'Inter Variable', sans-serif`
  - petakan token shadcn di `:root`: `--primary` deep, `--primary-foreground` putih, `--accent`/`--secondary` pale, `--ring` green, `--background` putih, `--foreground` ink, `--radius: 0.875rem`
  - tambah token palet dan ketiga kelas utilitas
- [ ] **Step 4:** Restyle komponen dasar:
  - `Card`: radius 20px, tanpa border keras, bayangan lembut.
  - `Input` dan `selectClass`/`inputClass` di `ui.ts`: tinggi `h-10`, `rounded-xl`, fokus `ring-green/40`.
  - `Table`: header `text-xs text-muted-foreground`, baris `hover:bg-pale/60`, sel lebih lega.
  - `Dialog`: radius 24px.
  - `Alert`: radius xl, varian default dengan latar pale.
  - `PageHeader`: judul `text-2xl font-bold text-ink`.
  - `StatusBadge`: processing menjadi `muted` dengan titik `animate-pulse`, review `warning`, done `success`, error `destructive`. Label tidak berubah.
- [ ] **Step 5:** Jalankan `bun test tests/unit/theme.test.ts && bun run check`. Keduanya harus PASS dengan 0 error.
- [ ] **Step 6:** Commit dengan `feat(app): green 3D theme tokens, font and base components`.

### Task 2: Data dashboard dan "Langkah berikutnya" (server)

**Files:**
- Create: `app/src/lib/server/reports/dashboard.ts`, `app/src/lib/server/dashboard/next-step.ts`
- Test: `app/tests/integration/dashboard.test.ts`

**Interfaces:**
- Consumes: `getBalanceSheet` (`reports/balance-sheet.ts`), `getTrialBalance`, `naturalBalanceAtStartOf` (`ledger/balance.ts`), `listUploads`, `getOpening`, `minRoleForPath`/`roleAtLeast` (`$lib/nav`, `$lib/roles`).
- Produces:
  ```ts
  export interface DashboardAction { kind: 'review' | 'journal' | 'error' | 'balance_warning' | 'opening'; label: string; detail: string; href: string }
  export interface DashboardView {
    bank: { accountId: string; name: string; balance: string } | null;
    pendingCount: number;
    latestUpload: { id: string; accountNo: string; periodStart: string; periodEnd: string } | null;
    monthly: Array<{ month: string /* 'YYYY-MM' */; income: string; expense: string }>; // panjang 6, terlama → bulan berjalan
    profitThisYear: string;
    balanced: boolean;
    recentTransactions: Array<{ id: string; txnDate: string; description: string; amount: string /* +kredit / −debit */; accountName: string | null }>; // ≤ 8, terbaru dulu
    actions: DashboardAction[];
  }
  export async function getDashboard(companyId: string, role: Role | null, today: string): Promise<DashboardView>;

  export interface NextStep { label: string; detail: string; href: string }
  export async function getNextStep(companyId: string, role: Role | null): Promise<NextStep | null>;
  ```
  Super admin diperlakukan sebagai `admin`. Urutan `getNextStep`: saldo awal belum ada → `/settings/opening-balance`; `pendingCount > 0` → `/review`; selain itu → `/uploads/new`. Setiap kandidat disaring dengan `roleAtLeast(role, minRoleForPath(href))`. Kalau tidak ada yang lolos, hasilnya `null`.

- [ ] **Step 1: Tulis test integrasi yang gagal** di `tests/integration/dashboard.test.ts`. Pakai pola `booksWithActivity` dari `tests/integration/balance-sheet.test.ts` (opening 2026-08-01, BIAYA ADM 30.000 tanggal 02-08, TRSF MASUK 2.500.000 tanggal 05-08, keduanya dikonfirmasi dan dijurnal). Test yang dibutuhkan:
  - `full books`: `getDashboard(companyId, 'admin', '2026-08-20')`. Diharapkan `bank.balance === '3470000.00'`, `pendingCount === 0`, `monthly.map(m=>m.month)` sama dengan `['2026-03','2026-04','2026-05','2026-06','2026-07','2026-08']`, `monthly[5]` sama dengan `{ month:'2026-08', income:'2500000.00', expense:'30000.00' }`, `monthly[4].income === '0.00'`, `profitThisYear === '2470000.00'`, `balanced === true`, `recentTransactions[0].amount === '2500000.00'` dengan `accountName` `'Pendapatan Jasa'`, `recentTransactions[1].amount === '-30000.00'`, `latestUpload.accountNo === '1234567890'`.
  - `empty company`: `makeCompany()` lalu `getDashboard`. Diharapkan `latestUpload === null`, `recentTransactions` dan `actions` hanya berisi `kind:'opening'`, `monthly` semua `'0.00'`, `profitThisYear === '0.00'`.
  - `no bank account`: set `companies.bankAccountId = null`. Diharapkan `bank === null`.
  - `actions per status`: upload dengan transaksi belum dikonfirmasi menghasilkan action `review` ber-href `/uploads/{id}`. Upload yang semua transaksinya dikonfirmasi tapi belum dijurnal menghasilkan `journal`. `balanceWarning` terisi menghasilkan `balance_warning`. Set status upload `error` menghasilkan `error`.
  - `viewer filtering`: untuk viewer, `actions` tidak memuat `review`/`journal`/`opening`, dan `getNextStep(companyId,'viewer')` bernilai `null`.
  - `next step order`: tanpa opening hasilnya href `/settings/opening-balance`. Dengan opening dan ada pending hasilnya `/review`. Dengan opening tanpa pending hasilnya `/uploads/new`.
- [ ] **Step 2:** Jalankan `cd app && bun test tests/integration/dashboard.test.ts`. Hasil yang diharapkan: FAIL (modul belum ada).
- [ ] **Step 3:** Implementasikan kedua modul. `monthly` diambil dengan satu query `transactions` yang dikelompokkan per `to_char(txn_date,'YYYY-MM')` untuk 6 bulan sampai bulan `today`, lalu diisi nol untuk bulan yang kosong. Profit diambil dari `getBalanceSheet(...).equity.lines`, baris `'Laba (Rugi) Tahun Berjalan'` (atau `'0.00'`). Status journal untuk upload diambil dari `journal_entries.upload_id`.
- [ ] **Step 4:** Jalankan `bun test tests/integration/dashboard.test.ts`. Harus PASS.
- [ ] **Step 5:** Commit dengan `feat(app): dashboard data and next-step queries`.

### Task 3: Shell aplikasi (sidebar, top bar, drawer HP)

**Files:**
- Modify: `app/src/lib/nav.ts` (tambah `icon: string` per item), `app/src/routes/(app)/+layout.svelte`, `app/src/routes/(app)/+layout.server.ts`
- Create: `app/src/lib/components/AppSidebar.svelte`, `app/src/lib/components/NextStepCard.svelte`
- Test: `app/tests/unit/nav.test.ts`

**Interfaces:**
- Consumes: `getNextStep` (Task 2), kelas `tile-3d`/token (Task 1).
- Produces: layout data `nextStep: NextStep | null`. Setiap `NavItem` punya `icon` yang merupakan key dari peta ikon lucide di `AppSidebar.svelte` (`LayoutDashboard`, `Upload`, `History`, `ListChecks`, `BookOpen`, `Library`, `Scale`, `Landmark`, `Building2`, `Users`, `ListTree`, `Wand2`, `Wallet`).

- [ ] **Step 1: Tulis test yang gagal** di `tests/unit/nav.test.ts`: `every nav item has an icon` mengecek bahwa `NAV.flatMap(g=>g.items).every(i => typeof i.icon === 'string' && i.icon.length > 0)`.
- [ ] **Step 2:** Jalankan `bun test tests/unit/nav.test.ts`. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Isi `icon` di `nav.ts` dan muat `nextStep` di `+layout.server.ts` (hanya kalau `ctx.companyId` ada). Bangun shell sesuai mockup v2:
  - **Desktop (`lg+`):** kanvas `bg-canvas p-6` dengan frame putih `rounded-[28px]`.
  - **Sidebar:**
    - logo `tile-3d` + "Jurnalku." berwarna green
    - grup ber-label
    - item ber-ikon dalam tile kecil + chevron; item aktif `bg-pale text-deep` dengan garis kiri green
    - `NextStepCard` lime (disembunyikan kalau `null`)
    - blok user + Keluar
  - **Top bar:** select perusahaan, link "+ Perusahaan baru" untuk super admin, "Halo, {nama}" + avatar inisial `tile-3d`.
  - **Di bawah `lg`:** tanpa frame, sidebar menjadi drawer (overlay + tombol `Menu` lucide di top bar, `aria-label="Buka menu"`), dan drawer menutup saat navigasi.
- [ ] **Step 4:** Jalankan `bun run test && bun run check`. Harus PASS.
- [ ] **Step 5:** Commit dengan `feat(app): new app shell with icon sidebar, top bar and mobile drawer`.

### Task 4: Halaman dashboard

**Files:**
- Modify: `app/src/routes/(app)/dashboard/+page.server.ts`, `app/src/routes/(app)/dashboard/+page.svelte`
- Create: `app/src/lib/components/dashboard/{BankCard,ReviewCard,AccountCard,StatBars,RecentTransactions,ActionList}.svelte`

**Interfaces:**
- Consumes: `getDashboard(ctx.companyId, ctx.user.isSuperAdmin ? 'admin' : ctx.role, todayIso())` (Task 2). Kelas tema (Task 1).
- Produces: komponen dashboard; tidak dipakai task lain.

- [ ] **Step 1:** Ganti `load` sehingga mengembalikan `{ dash: DashboardView }`.
- [ ] **Step 2:** Bangun halaman sesuai mockup v2:
  - **3 kartu:** Saldo Bank (gradien lime pucat, link "Buku Besar" ke `/ledger?account_id=…`, ajakan atur akun bank kalau `bank === null`), Status Review (objek 3D CSS + jumlah, link `/review`), kartu rekening lime bergaya kartu bank (ajakan upload kalau `latestUpload === null`).
  - **Baris 3 statistik:** komponen `StatBars` dengan props `{ label, value, values: string[], color, tag? }`. Bar terakhir disorot dengan `.glow`, label bulan diberi `title`.
  - **Panel transaksi terbaru:** dikelompokkan per tanggal, `truncate` pada keterangan.
  - **Panel "Perlu Tindakan":** ikon `tile-3d` per `kind`, dengan keadaan kosong.
  - Grid 3 kolom di `lg`, 1 kolom di HP.
- [ ] **Step 3:** Jalankan `bun run check && bun run build`. Harus PASS.
- [ ] **Step 4:** Commit dengan `feat(app): redesigned dashboard`.

### Task 5: Restyle halaman alur eStatement dan buku

**Files:**
- Modify: `app/src/routes/(app)/{uploads/+page.svelte,uploads/new/+page.svelte,uploads/[id]/+page.svelte,review/+page.svelte,journal/+page.svelte,ledger/+page.svelte,trial-balance/+page.svelte,balance-sheet/+page.svelte}`

**Interfaces:**
- Consumes: token, `.panel`, `.tile-3d`, varian Badge/Button (Task 1).

- [ ] **Step 1:** Di setiap halaman:
  - bungkus tabel dan form utama dengan `.panel` (dengan `overflow-x-auto` untuk tabel)
  - ganti semua kelas `slate|blue|red-6xx` hardcoded dengan token (`text-muted-foreground`, `text-deep`, `text-destructive`, `bg-pale`)
  - angka tetap `tabular-nums` rata kanan
  - form filter tanggal memakai `inputClass` baru
  - Dropzone upload: tile ikon `Upload` 3D, border putus-putus `border-green/40`, saat drag `border-green bg-pale`
  - Neraca dan Neraca Saldo: baris total `bg-pale font-bold`, judul seksi `text-deep`
- [ ] **Step 2:** Jalankan `bun run check && bun run test`. Harus PASS.
- [ ] **Step 3:** Commit dengan `feat(app): restyle statement, journal and report pages`.

### Task 6: Restyle pengaturan, dialog, dan login

**Files:**
- Modify: `app/src/routes/(app)/settings/{company,users,accounts,rules,opening-balance}/+page.svelte`, `app/src/lib/components/NewAccountDialog.svelte`, `app/src/routes/login/+page.svelte`
- Test: `app/tests/unit/no-hardcoded-colors.test.ts`

- [ ] **Step 1: Tulis test yang gagal** `tests/unit/no-hardcoded-colors.test.ts`. Test ini membaca semua `*.svelte` di `src/routes` dan `src/lib/components` (kecuali `src/lib/components/ui`) dengan `Bun.Glob`, lalu memastikan tidak ada yang cocok dengan `/\b(?:text|bg|border|ring)-(?:slate|blue|gray)-\d{2,3}\b/`. Pesan gagalnya menyebut file yang melanggar.
- [ ] **Step 2:** Jalankan `bun test tests/unit/no-hardcoded-colors.test.ts`. Hasil yang diharapkan: FAIL dan menyebut file-file pengaturan/login yang belum di-restyle.
- [ ] **Step 3:** Restyle pengaturan dengan pola Task 5 (panel, tabel, form, tombol). Login: kanvas `bg-canvas`, kartu `rounded-[28px]` dengan logo `tile-3d` + "Jurnalku." berwarna green, aksen lime di sudut. Label dan teks tombol tidak berubah.
- [ ] **Step 4:** Jalankan `bun run test && bun run check`. Harus PASS (test warna lulus).
- [ ] **Step 5:** Commit dengan `feat(app): restyle settings, dialogs and login`.

### Task 7: Verifikasi menyeluruh

**Files:**
- Modify (hanya kalau perlu): `app/tests/e2e/smoke.spec.ts`

- [ ] **Step 1:** Jalankan `cd app && bun run test && bun run check && bun run build`. Semua harus PASS.
- [ ] **Step 2:** Jalankan `cd app && bunx playwright test` (butuh sidecar di :8000 dan DB test). Harus 1 passed. Kalau gagal karena selector, perbaiki markup agar teks Global Constraints tetap ada. Jangan melemahkan test.
- [ ] **Step 3:** Cek visual di Chrome, di dev server `:5173` dengan data dev, pada lebar 1440px dan 390px: `/login`, `/dashboard`, `/review`, `/balance-sheet`, `/settings/accounts`. Pastikan:
  - tidak ada scroll horizontal di level halaman
  - teks panjang terpotong rapi
  - drawer bisa dibuka dan ditutup di HP
  - keadaan kosong dashboard dicek dengan membuat perusahaan baru
- [ ] **Step 4:** Commit perbaikan yang muncul dengan `fix(app): visual polish from review`.
