# Sidebar Ciut, Date Picker, DataTable, Reset Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enam perbaikan UI dari spec: sidebar tanpa profil dan bisa diciutkan, tombol perusahaan yang rapi, `DateField`, `DataTable`, dan tombol Reset filter.

**Architecture:**
- Shell: state ciut disimpan di `localStorage['jk-sidebar']` dan dipasang sebagai atribut `data-sidebar` pada `<html>` oleh skrip inline. Lebar sidebar dan padding konten mengikuti atribut itu lewat varian CSS.
- `DateField`: bungkus bits-ui `DatePicker` dengan nilai string ISO.
- `DataTable`: komponen generik, dengan logika murni (filter/urut/potong halaman) di `$lib/table.ts` supaya bisa dites unit.

**Tech Stack:** Svelte 5, bits-ui 2.19.5, `@internationalized/date`, Tailwind v4, bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-sidebar-collapse-datatable-datepicker-design.md`. Mockup: `.superpowers/brainstorm/93401-1792230590/content/table-datepicker-sidebar.html`.

## Global Constraints

- **Kunci localStorage:** `jk-sidebar` = `expanded|collapsed`, default `expanded`. Atribut di `<html>`: `data-sidebar="collapsed"`.
- **Lebar sidebar:** lebar `w-64` (16rem), ciut `w-16` (4rem). Konten memakai `lg:pl-64`/`lg:pl-16` mengikuti atribut. Sidebar desktop tetap `fixed top-0 bottom-10`.
- **DateField:** nilai `YYYY-MM-DD` (string, `''` = kosong), locale `id-ID`, minggu mulai Senin, tampilan `dd MMM yyyy`.
- **DataTable:** ukuran halaman `[10, 25, 50]`, default 10. Urut naik → turun → asal. Teks kosong "Belum ada data." dan saat cari "Tidak ada data yang cocok".
- **Teks e2e yang tidak boleh berubah:**
  - tombol `Masuk`, `Unggah`, `Generate Jurnal`, `Konfirmasi semua saran…`, `Tampilkan`
  - teks `Perlu review`, `Tidak ada transaksi yang menunggu konfirmasi.`
  - badge `Balance` (exact), label `Akun induk`, `Kode`, `Nama`, `Role`, `Akun tujuan`, `Keyword`
  - `Menu profil`, `Buka menu`, `Perusahaan baru`
- **Tidak ada dependensi baru.**

## Review Focus

- **Halaman yang diperpendek oleh paginasi:** aksi di baris halaman 2+ (ganti role, nonaktifkan) harus tetap mengenai baris yang benar, dengan key = id baris, bukan indeks. Dites di Task 3.
- **Data berubah setelah aksi** (`invalidateAll`): halaman aktif yang melebihi jumlah halaman baru harus dijepit ke halaman terakhir, bukan menampilkan halaman kosong. Dites di Task 3.
- **DateField dikosongkan lewat "Hapus"** di filter GET: field tidak terkirim atau kosong, dan server memakai default. Dites di Task 2.
- **Sidebar ciut dengan keyboard:** tooltip muncul saat item difokus (Tab), dan tombol toggle punya `aria-expanded`/`aria-label`. Dites di Task 1.
- **Reload saat sidebar ciut:** tidak ada lompatan lebar. Atribut sudah terpasang sebelum JS aplikasi, dites dengan memblokir JS aplikasi (pola `theme.spec`). Dites di Task 1.

---

### Task 1: Sidebar tanpa profil, bisa diciutkan, + tombol Perusahaan baru

**Files:**
- Create: `app/src/lib/sidebar.ts` (`SIDEBAR_KEY`, `readSidebar(): 'expanded'|'collapsed'`, `applySidebar(state)`)
- Modify: `app/src/app.html` (skrip inline ditambah `data-sidebar`), `app/src/app.css` (varian lebar), `app/src/lib/components/AppSidebar.svelte`, `app/src/routes/(app)/+layout.svelte`
- Test: `app/tests/e2e/sidebar-collapse.spec.ts`

**Interfaces:**
- Produces:
  - Prop `collapsed: boolean` dan `ontoggle?: () => void` pada `AppSidebar`. Instance drawer HP selalu `collapsed={false}` tanpa toggle.
  - Tombol toggle: `aria-label="Ciutkan sidebar"` atau `"Lebarkan sidebar"`, dengan `aria-expanded={!collapsed}`.

- [ ] **Step 1: Test e2e yang gagal** (viewport 1280×720, login admin):
  - Sidebar (`aside` pertama) tidak memuat tombol `Keluar` maupun link "Profil Saya".
  - Klik `Ciutkan sidebar` → lebar `aside` 64px, label teks menu tidak terlihat, dan `header` bergeser sehingga `x` < 100.
  - Fokus link Dashboard dengan keyboard → tooltip `Dashboard` terlihat.
  - Reload → tetap ciut. Dengan `page.route('**/_app/**/*.js', abort)`, `<html>` punya `data-sidebar="collapsed"`.
  - Klik `Lebarkan sidebar` → lebar 256px.
  - Tombol `Perusahaan baru` punya tinggi 40px dan border.
- [ ] **Step 2:** Jalankan `cd app && bunx playwright test tests/e2e/sidebar-collapse.spec.ts`. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasi:
  - Hapus blok profil/Keluar dari `AppSidebar`. Kartu "Langkah berikutnya" tetap ada (disembunyikan saat ciut).
  - Mode ciut: logo hanya tile, label grup disembunyikan, label item `sr-only`, dan item dibungkus `Tooltip` (side `right`).
  - Indikator memakai pengukuran yang sama.
  - Toggle `ChevronsLeft`/`ChevronsRight` di bawah sidebar.
  - `applySidebar` menulis localStorage (dengan try/catch) dan atribut `<html>`.
  - Layout membaca state via `readSidebar()` di `onMount`. Lebar `aside` dan `lg:pl-*` memakai kelas yang bergantung pada atribut `<html>` (mis. `in-data-[sidebar=collapsed]:w-16`) supaya benar sebelum hydrate.
  - Tombol "+ Perusahaan baru" memakai `Button variant="outline"` (h-10). Di bawah `sm` jadi icon-only.
- [ ] **Step 4:** Jalankan `bunx playwright test && bun run check`. Harus PASS.
- [ ] **Step 5:** Commit dengan `feat(app): collapsible sidebar without profile block; tidy new-company button`.

### Task 2: `DateField` + tombol Reset filter

**Files:**
- Create: `app/src/lib/components/DateField.svelte`
- Modify: `app/src/routes/(app)/{journal,ledger,trial-balance,balance-sheet}/+page.svelte`, `app/src/routes/(app)/settings/opening-balance/+page.svelte`
- Test: `app/tests/e2e/datefield.spec.ts`

**Interfaces:**
- Produces: `<DateField id? name? bind:value={string} placeholder? class? aria-label? onblur? aria-invalid? aria-describedby? />`. Trigger dan segmen bergaya sama dengan dropdown, dan popover berisi `Calendar` id-ID (`weekStartsOn={1}`) dengan footer "Hari ini" dan "Hapus". Kalau ada `name`, dirender input hidden bernilai `value`.
- Reset: `<Button href={page.url.pathname} variant="ghost">↺ Reset</Button>`. Kalau `page.url.search === ''`, tombol dirender sebagai `aria-disabled` tanpa href.

- [ ] **Step 1: Test e2e yang gagal:**
  - `/trial-balance` → buka date picker "Per tanggal", pilih tanggal 31 di bulan tampil lewat kalender, lalu klik `Tampilkan`. URL memuat `as_of=YYYY-MM-31`, dan tanggal yang dipilih tampil sebagai `31 … 20xx`.
  - Pada `/journal?from=2026-08-01&to=2026-08-31`, isi kedua tanggal sesuai query. Klik `Reset` → URL menjadi `/journal` tanpa query.
  - Ketik tanggal lewat keyboard di segmen DateField Saldo Awal → tersimpan di field. "Hapus" membuat field kosong dan validasi menampilkan `Tanggal wajib diisi` setelah Simpan.
- [ ] **Step 2:** Jalankan test di atas. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasi komponen dan penggantian kelima `<input type="date">`, ditambah tombol Reset di empat filter.
- [ ] **Step 4:** Jalankan `bunx playwright test && bun run check`. Harus PASS.
- [ ] **Step 5:** Commit dengan `feat(app): themed date picker and filter reset buttons`.

### Task 3: `DataTable` + gaya tabel laporan

**Files:**
- Create: `app/src/lib/table.ts`, `app/src/lib/components/DataTable.svelte`
- Modify: `app/src/routes/(app)/uploads/+page.svelte`, `app/src/routes/(app)/uploads/[id]/+page.svelte`, `app/src/routes/(app)/settings/{rules,users,accounts}/+page.svelte`, `app/src/lib/components/ui/table/*.svelte` (gaya header untuk tabel laporan)
- Test: `app/tests/unit/table.test.ts`, `app/tests/e2e/datatable.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Column<T> { key: string; label: string; sortable?: boolean; searchable?: boolean; align?: 'left' | 'right'; sortValue?: (row: T) => string | number; text?: (row: T) => string }
  export type SortState = { key: string; dir: 'asc' | 'desc' } | null;
  export function nextSort(current: SortState, key: string): SortState; // asc → desc → null
  export function view<T>(rows: T[], cols: Column<T>[], opts: { query: string; sort: SortState; page: number; pageSize: number }): { rows: T[]; total: number; filtered: number; page: number; pageCount: number; from: number; to: number };
  ```
  `view` menjepit `page` ke `[1, pageCount]`, dengan `pageCount ≥ 1`.
- `<DataTable rows columns rowKey searchPlaceholder emptyText sortable={true} {cell} />`. `sortable={false}` mematikan urut untuk semua kolom (dipakai Chart of Accounts).

- [ ] **Step 1: Test unit yang gagal** di `table.test.ts`:
  - `nextSort` berputar asc → desc → null, dan kolom lain dimulai dari asc.
  - `view` dengan query `'kas'` hanya mencocokkan kolom `searchable`, tanpa membedakan huruf besar/kecil.
  - Urut angka memakai `sortValue`, dan teks memakai `localeCompare('id')`.
  - Paginasi: 23 baris dengan pageSize 10 → pageCount 3, page 3 berisi 3 baris dengan from 21 dan to 23.
  - `page: 9` dijepit ke 3. Data kosong menghasilkan pageCount 1, from 0, to 0.
- [ ] **Step 2:** Jalankan `bun test tests/unit/table.test.ts`. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasi `table.ts` hingga lulus test unit.
- [ ] **Step 4: Test e2e yang gagal** `datatable.spec.ts`:
  - `/settings/rules` (19 rule SYSTEM): teks "1–10 dari 19", lalu klik halaman 2 → "11–19 dari 19".
  - Cari `BPJS` → 2 baris, "Tidak ada data yang cocok" untuk `zzz`.
  - Klik header Keyword dua kali → `aria-sort="descending"`.
  - Hapus rule di halaman 2 mengenai baris yang benar: rule yang dihapus hilang dan yang lain tetap.
- [ ] **Step 5:** Implementasi `DataTable.svelte` lalu terapkan ke kelima tabel. Aksi baris dirender lewat snippet `cell` dengan key = id. Tabel laporan cukup memakai gaya header/panel.
- [ ] **Step 6:** Jalankan `bun run test && bunx playwright test && bun run check`. Harus PASS.
- [ ] **Step 7:** Commit dengan `feat(app): datatable with search, sort and pagination for list tables`.

### Task 4: Verifikasi menyeluruh

- [ ] **Step 1:** Jalankan `cd app && bun run test && bun run check && bun run build && bunx playwright test`. Semua harus PASS.
- [ ] **Step 2:** Cek visual kedua tema, desktop dan 390px: sidebar lebar/ciut, header, Jurnal (date picker terbuka + Reset), Riwayat Upload, Rules (paginasi), Chart of Accounts, Neraca, dan Saldo Awal.
- [ ] **Step 3:** Commit perbaikan yang ditemukan dengan `fix(app): polish from visual check`.
