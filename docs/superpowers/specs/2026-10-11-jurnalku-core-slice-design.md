# Jurnalku — Core Slice (Phase 0–4) Design

> Sub-project 1 dari PRD (`PRD.md`). Status: draft untuk review.
> Tanggal: 2026-10-11

## 1. Tujuan

Membangun alur inti Jurnalku end-to-end yang benar-benar bisa dipakai:

**Upload eStatement BCA (PDF) → parse → kategorisasi (rule → AI lokal) → review & konfirmasi → jurnal double-entry → Buku Besar → Neraca Saldo**

dengan fondasi multi-company, multi-user + RBAC, dan deployment Docker Compose.

### Kriteria sukses
1. `docker compose up -d` menjalankan app, sidecar, db, dan ollama; `bun run db:seed` membuat super admin, perusahaan demo, CoA PSAK, dan rule default.
2. Statement BCA asli (`sample/08.pdf`) ter-parse dengan checksum footer cocok.
3. Transaksi yang cocok dengan rule otomatis confirmed; sisanya muncul di Review dengan saran AI.
4. Setelah semua confirmed, jurnal bisa di-generate, dan Neraca Saldo balance.
5. User dengan role `viewer` tidak bisa memanggil endpoint tulis; user perusahaan A tidak bisa melihat data perusahaan B.
6. PDF tidak pernah tersimpan permanen; `sample/` dan `samples/` tidak pernah masuk git.

### Di luar scope (sub-project berikutnya)
Laporan Laba Rugi, Posisi Keuangan, Perubahan Ekuitas, Arus Kas; CALK; semua export (CSV/Excel/PDF/ZIP RUPST); Preferensi Sistem; banyak rekening bank per perusahaan; mengubah kategori transaksi yang sudah dijurnal.

## 2. Keputusan yang menyimpang dari / memperjelas PRD

| # | PRD | Keputusan | Alasan |
|---|---|---|---|
| D1 | `categorizer.py` di sidecar, akses DB langsung | Sidecar **hanya parse PDF** (stateless, tanpa DB). Rule matching + panggilan Ollama di app (TS) | Satu pemilik DB & schema, sidecar mudah dites |
| D2 | Tabel `users` sendiri dengan password | Pakai tabel Better Auth (`user`, `session`, `account`, `verification`); `user` ditambah `is_super_admin` dan `is_active` | Better Auth mengelola hash & session |
| D3 | Route register + endpoint invite | **Tidak ada registrasi publik.** Admin/super_admin membuat user dengan password awal, lalu menautkannya ke perusahaan + role | Self-hosted, tanpa layanan email |
| D4 | `super_admin` sebagai nilai role per perusahaan | `super_admin` = flag global `user.is_super_admin`; enum role per perusahaan: `admin \| accountant \| viewer` | Super admin bersifat lintas perusahaan |
| D5 | AI conf ≥ 0.8 langsung assign | **Hanya RULE yang auto-confirmed.** Hasil AI selalu masuk Review sebagai saran; ada bulk-confirm untuk ≥ 0.8 | Tidak ada keputusan AI masuk laporan tanpa dicek manusia |
| D6 | Saldo awal tidak dibahas | Halaman **Saldo Awal** manual → satu journal entry `OPENING` per perusahaan | Benar secara akuntansi |
| D7 | Kolom debit/kredit terpisah | BCA memakai **satu kolom mutasi** dengan akhiran `DB`; tanpa akhiran = kredit. Saldo hanya ada di baris akhir hari (nullable) | Sesuai format PDF asli |
| D8 | `journal_entries.transaction_id` tanpa cascade | `ON DELETE CASCADE`; transaksi terkunci setelah dijurnal | Hapus upload = hapus jurnalnya |
| D9 | Nama "LedgerAI" | Semua nama memakai **Jurnalku** (seed email `admin@jurnalku.local`) | Konsistensi |
| D10 | Folder `samples/` | Folder yang ada adalah `sample/`; keduanya di-gitignore | Data keuangan asli |
| D11 | Rule tanpa arah | `category_rules.direction` (`DB`/`CR`/NULL); rule hanya cocok untuk arah yang sama. Rule seed diberi arah; rule seed `BI-FAST` dihapus | `TOKOPEDIA → Pendapatan` salah untuk uang keluar; `BI-FAST` juga muncul di transfer masuk |
| D12 | PDF disimpan ke file temp lalu dihapus | PDF diteruskan dari memori ke sidecar, tanpa file temp | Lebih ketat: tidak pernah menyentuh disk |
| D13 | Seeder di `seeds/02_coa.ts` dst. | Data CoA & rule di `app/src/lib/server/company/`; `seeds/index.ts` hanya CLI | Data yang sama dipakai saat membuat perusahaan baru |

## 3. Arsitektur

```
┌──────────── docker-compose (network internal) ────────────┐
│  app (SvelteKit + Bun) ──HTTP──► sidecar (FastAPI)          │
│        │  │                       POST /parse  (stateless)  │
│        │  └──HTTP──► ollama (qwen2.5:7b)                    │
│        └──SQL──► db (Postgres 16)                           │
└────────────────────────────────────────────────────────────┘
```

### 3.1 Struktur repo

```
jurnalku/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── app/                               # SvelteKit + Bun
│   ├── Dockerfile
│   ├── drizzle.config.ts
│   ├── drizzle/migrations/
│   ├── seeds/
│   │   ├── index.ts                   # bun run db:seed
│   │   ├── 01_admin.ts
│   │   ├── 02_coa.ts                  # data CoA PSAK (PRD §12)
│   │   └── 03_rules.ts                # rule SYSTEM (PRD §12)
│   ├── src/
│   │   ├── hooks.server.ts            # session + company aktif + guard
│   │   ├── lib/
│   │   │   ├── components/ui/         # shadcn-svelte
│   │   │   ├── nav.ts                 # definisi menu + role yang boleh
│   │   │   └── server/
│   │   │       ├── db/{index,schema}.ts
│   │   │       ├── auth.ts            # Better Auth config
│   │   │       ├── rbac.ts            # requireRole, companyScope
│   │   │       ├── api.ts             # helper error JSON + zod parse
│   │   │       ├── money.ts           # decimal helper (tanpa float)
│   │   │       ├── company/seed-company.ts   # seed CoA + rules untuk 1 perusahaan
│   │   │       ├── uploads/{service,sidecar-client}.ts
│   │   │       ├── categorize/{normalize,rules,ollama,pipeline}.ts
│   │   │       ├── jobs.ts            # runner in-process
│   │   │       ├── journal/{generate,opening}.ts
│   │   │       └── reports/{ledger,trial-balance}.ts
│   │   └── routes/
│   │       ├── (auth)/login/
│   │       ├── (app)/{dashboard,uploads,review,journal,ledger,trial-balance,settings/*}/
│   │       └── api/...
│   └── tests/{unit,integration,e2e}/
├── sidecar/                           # Python FastAPI
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                        # FastAPI app, POST /parse, GET /health
│   ├── bca_parser.py                  # pdfplumber → BcaStatement
│   └── tests/
│       ├── make_fixture.py            # generator PDF sintetis (reportlab)
│       ├── test_parser_synthetic.py
│       └── test_parser_sample.py      # skip jika sample/08.pdf tidak ada
├── ollama/entrypoint.sh               # serve + pull $OLLAMA_MODEL
└── docs/superpowers/specs/
```

### 3.2 Unit & tanggung jawab

| Unit | Tanggung jawab | Bergantung pada |
|---|---|---|
| `sidecar/bca_parser.py` | PDF bytes → `BcaStatement` tervalidasi checksum, atau raise `ParseError(reason)` | pdfplumber |
| `uploads/sidecar-client.ts` | Kirim PDF ke sidecar, map 422/5xx ke error domain | `SIDECAR_URL` |
| `uploads/service.ts` | Validasi file, cek duplikat, cek saldo awal, simpan transaksi, enqueue job | db, sidecar-client, jobs |
| `categorize/normalize.ts` | Deskripsi → kunci grup (pure function) | — |
| `categorize/rules.ts` | Cari rule yang cocok untuk deskripsi; terapkan rule ke transaksi pending | db |
| `categorize/ollama.ts` | Prompt batch → hasil tervalidasi zod; retry 1x | `OLLAMA_URL`, `OLLAMA_MODEL` |
| `categorize/pipeline.ts` | Orkestrasi rule → AI → set status upload | rules, ollama, db |
| `jobs.ts` | Antrian in-process (serial per perusahaan), resume upload `processing` saat startup | pipeline |
| `journal/generate.ts` | Transaksi confirmed → journal entries, validasi balance, dalam satu DB transaction | db, money |
| `journal/opening.ts` | Simpan/ganti jurnal OPENING, validasi balance | db, money |
| `reports/ledger.ts`, `trial-balance.ts` | Query agregasi per akun/periode | db |
| `rbac.ts` | Resolusi company aktif, role efektif, `requireRole`, helper scope `company_id` | auth, db |

## 4. Data model

Mengikuti PRD §9 dengan perubahan berikut (Drizzle, Postgres 16). Semua uang `NUMERIC(18,2)`; di TS diperlakukan sebagai string dan dihitung dengan decimal helper — tidak pernah `number`.

- **Better Auth tables** (`user`, `session`, `account`, `verification`) — menggantikan `users`. Kolom tambahan di `user`: `is_super_admin BOOLEAN DEFAULT false`, `is_active BOOLEAN DEFAULT true`. Hash password: argon2.
- **`user_role` enum**: `admin | accountant | viewer`.
- **`companies`**: + `bank_account_id UUID REFERENCES accounts(id)` (di-set ke `1-1002` saat seed perusahaan).
- **`accounts`**: sesuai PRD. "Leaf" = akun tanpa anak; hanya leaf yang bisa dipilih untuk transaksi/jurnal.
- **`category_rules`**: + `direction tx_direction NULL` (`DB | CR`), `UNIQUE(company_id, keyword_pattern, direction) NULLS NOT DISTINCT`. Keyword disimpan uppercase.
- **`upload_status` enum**: `processing | review | done | error`.
- **`statement_uploads`**: + `account_no VARCHAR(30)`, `opening_balance`, `closing_balance NUMERIC(18,2)`, `balance_warning TEXT NULL`, `error_message TEXT NULL`, `ai_status TEXT NULL` (`ok | partial | unavailable`).
- **`transactions`**: + `line_no INTEGER` (urutan dalam statement), `ai_suggested_account_id UUID NULL`, `ai_reason TEXT NULL`, `ai_keyword TEXT NULL`, `group_key TEXT`. `company_id NOT NULL`.
- **`journal_type` enum**: `OPENING | TRANSACTION`.
- **`journal_entries`**: + `type journal_type NOT NULL`, `upload_id UUID NULL REFERENCES statement_uploads ON DELETE CASCADE`; `transaction_id` `ON DELETE CASCADE`, `UNIQUE(transaction_id)`.
- **`journal_lines`**: + `CHECK (debit >= 0 AND credit >= 0 AND (debit = 0) <> (credit = 0))`.
- Tabel `equity_adjustments` dan `calk_notes` **tidak** dibuat di slice ini.

Seeder: `bun run db:seed` idempoten. Membuat super admin dari `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, perusahaan "PT Demo Perusahaan", lalu memanggil `seedCompany(companyId)` yang memasukkan CoA PSAK (PRD §12 Seeder 2) dan rule SYSTEM (PRD §12 Seeder 3) dengan `priority = 0`. Fungsi `seedCompany` yang sama dipanggil saat super admin membuat perusahaan baru.

## 5. Sidecar — parser BCA

`POST /parse` (multipart `file`) → `200`:
```json
{
  "account_no": "string",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "opening_balance": "decimal-string",
  "closing_balance": "decimal-string",
  "transactions": [
    { "line_no": 1, "date": "YYYY-MM-DD", "description": "string",
      "amount": "decimal-string", "direction": "DB|CR", "balance": "decimal-string|null" }
  ]
}
```
`422 { "reason": "not_bca" | "checksum_mismatch" | "unreadable", "detail": "..." }`. `GET /health` → `200`.

Algoritma:
1. Header per halaman: ambil `NO. REKENING`, `PERIODE : <BULAN> <TAHUN>` (nama bulan Indonesia). Tidak ditemukan → `not_bca`.
2. Lokasi kolom: cari kata header tabel `TANGGAL`, `KETERANGAN`, `CBG`, `MUTASI`, `SALDO` dan pakai koordinat x-nya sebagai batas kolom (via `page.extract_words()`), bukan regex teks mentah.
3. Baris diawali token `DD/MM` di kolom TANGGAL = transaksi baru; baris tanpa tanggal di area tabel = lanjutan keterangan (digabung dengan spasi). Baris `SALDO AWAL` → opening balance, bukan transaksi.
4. Kolom MUTASI: angka format `1,234,567.89`, diikuti `DB` opsional → `direction`. Kolom SALDO: opsional.
5. Tahun dari PERIODE; `period_start` = tanggal 1, `period_end` = akhir bulan.
6. Footer (halaman terakhir): `SALDO AWAL`, `MUTASI CR <total> <count>`, `MUTASI DB <total> <count>`, `SALDO AKHIR`. Validasi: jumlah & count CR/DB cocok, opening + CR − DB = closing, dan setiap saldo per baris yang ada cocok dengan saldo berjalan. Gagal → `checksum_mismatch`.
7. Semua angka memakai `Decimal`, tidak pernah float.

## 6. Alur data

### 6.1 Upload — `POST /api/uploads` (accountant+)
1. Validasi: ekstensi `.pdf`, magic bytes `%PDF`, ≤ 10 MB → selain itu `400`.
2. Teruskan PDF dari memori ke sidecar (tanpa file temp, D12). Sidecar tidak bisa dihubungi → `503 sidecar_unavailable`. `422` dari sidecar → `422` dengan pesan user-friendly; tidak ada yang disimpan.
3. Duplikat: upload lain di company yang sama dengan `account_no` sama dan periode tumpang tindih → `409 duplicate_statement`.
4. Cek saldo awal: jika jurnal OPENING ada, hitung saldo akun bank perusahaan per `period_start − 1 hari`; jika ≠ `opening_balance` PDF, isi `balance_warning` (tidak memblokir).
5. Insert `statement_uploads` (status `processing`) + `transactions` (`DB` → `debit = amount`, `CR` → `credit = amount`, `group_key = normalize(description)`), dalam satu DB transaction.
6. Enqueue job kategorisasi; response `201 { id }`. UI mem-polling `GET /api/uploads/:id` sampai status ≠ `processing`.

### 6.2 Job kategorisasi
1. **Rule** — untuk tiap transaksi belum confirmed: cari rule milik perusahaan (akun tujuan aktif) dengan `direction IS NULL` atau sama dengan arah transaksi, yang keyword-nya terkandung secara literal (tanpa wildcard, case-insensitive) di deskripsi; urutan: `source` USER > SYSTEM, `priority` tertinggi, keyword terpanjang. Cocok → `account_id`, `source = RULE`, `ai_confidence = 1.000`, `is_confirmed = true`, `confirmed_at = now()`, `confirmed_by = NULL`.
2. **AI** — sisa transaksi dikelompokkan per `group_key`. Grup dikirim per batch ≤ 10 ke Ollama (`/api/chat`, `format: "json"`, `temperature: 0`). Prompt memuat daftar akun leaf aktif (kode, nama, tipe), dan per grup: contoh deskripsi, arah, nominal. Output yang diharapkan: `{ "results": [{ "group_id", "account_code", "confidence", "reason", "keyword" }] }`, divalidasi zod; `account_code` harus leaf aktif milik perusahaan.
   - JSON invalid / kode tidak dikenal → retry batch 1x; gagal lagi → grup itu tanpa saran.
   - Ollama tidak bisa dihubungi / timeout (60 dtk per batch) → hentikan langkah AI; semua sisa tanpa saran; `ai_status = unavailable` (bukan error — upload tetap lanjut ke `review`). Sebagian batch gagal → `ai_status = partial`; semua berhasil → `ok`.
   - Hasil disalin ke semua transaksi dalam grup: `ai_suggested_account_id`, `ai_confidence`, `ai_reason`, `ai_keyword`, `source = AI`, `is_confirmed = false`.
3. Status upload → `review` bila masih ada yang belum confirmed, selain itu `done`.
4. Exception tak terduga → status `error`, `error_message` diisi. `POST /api/uploads/:id/categorize` (accountant+) menjalankan ulang job untuk transaksi yang belum confirmed.
5. Runner: satu antrian in-process, job dijalankan serial. Saat app start, semua upload berstatus `processing` di-enqueue ulang.

### 6.3 Review & Konfirmasi
- Halaman menampilkan transaksi `is_confirmed = false` per upload, dengan dropdown akun leaf (prefill saran AI), badge confidence, alasan AI.
- `PATCH /api/transactions/:id/confirm` (accountant+), body `{ account_id, rule?: { keyword } }`:
  - Ditolak `409` jika transaksi sudah dijurnal.
  - Set `account_id`, `is_confirmed = true`, `confirmed_by`, `confirmed_at`; `source = AI` jika `account_id` = saran AI, selain itu `USER`.
  - Jika `rule` ada: upsert rule `source = USER`, `priority = 100`, keyword uppercase dan di-trim (min 3 karakter). Keyword default di UI: `ai_keyword` atau `group_key`; checkbox "Buat rule" default dicentang.
  - Rule baru langsung diterapkan ke transaksi pending lain di perusahaan yang sama (menjadi `source = RULE`, confirmed). Response memuat jumlah transaksi yang ikut ter-confirm.
- `POST /api/transactions/bulk-confirm` (accountant+), body `{ upload_id, min_confidence: 0.8 }`: terima semua saran AI ≥ ambang, buat rule dari `ai_keyword` (jika ada), lalu terapkan rule ke pending lain.
- Buat akun inline: `POST /api/accounts` diizinkan untuk accountant+ jika berupa akun leaf baru di bawah parent yang dipilih; `type` dan `normal_bal` diturunkan dari parent. CRUD CoA penuh tetap admin+.
- Setelah semua transaksi suatu upload confirmed, status upload → `done`.

### 6.4 Generate jurnal — `POST /api/journal/generate` (accountant+), body `{ upload_id }`
1. Ada transaksi belum confirmed di upload → `409 unconfirmed_transactions` (dengan jumlahnya).
2. Untuk tiap transaksi confirmed yang belum punya jurnal, buat entry `type = TRANSACTION`:
   - `DB` (uang keluar): Dr `account_id` / Cr `companies.bank_account_id`
   - `CR` (uang masuk): Dr `companies.bank_account_id` / Cr `account_id`
   - `ref_no` = `BCA-YYYYMM-NNNN` (nomor urut per perusahaan per bulan), `description` = deskripsi transaksi, `entry_date` = `txn_date`.
3. Semua dalam satu DB transaction; validasi Σdebit = Σcredit per entry dan total sebelum commit; gagal → rollback + `422 unbalanced`.
4. Idempoten: memanggil ulang tidak membuat duplikat (`UNIQUE(transaction_id)`).

### 6.5 Saldo Awal — `GET/PUT /api/opening-balance` (accountant+ untuk tulis)
- Body `{ date, lines: [{ account_id, debit, credit }] }`; hanya akun leaf; Σdebit = Σcredit wajib, selain itu `422`.
- Menyimpan/mengganti satu-satunya entry `type = OPENING` milik perusahaan (`ref_no = OPENING`).

### 6.6 Buku Besar & Neraca Saldo
- `GET /api/reports/ledger?account_id&from&to` — saldo awal (OPENING + semua baris sebelum `from`), daftar mutasi dalam periode dengan saldo berjalan, saldo akhir. Saldo mengikuti `normal_bal` akun.
- `GET /api/reports/trial-balance?as_of` — semua akun leaf dengan saldo ≠ 0 per `as_of`, disajikan di kolom debit atau kredit sesuai tanda saldo; total debit, total kredit, dan flag `balanced`.
- Dihitung saat dibaca dari `journal_lines` dengan agregasi SQL; tidak ada tabel snapshot.

## 7. Auth, multi-company, RBAC

- Better Auth email+password; session cookie. `user.is_active = false` → login ditolak.
- **Company aktif** disimpan di cookie `jk_company`; `hooks.server.ts` memvalidasinya terhadap `user_companies` (atau semua perusahaan untuk super admin). Tidak valid / kosong → pakai perusahaan pertama milik user; user tanpa perusahaan → halaman "Belum terhubung ke perusahaan".
- **Role efektif** = role di `user_companies` untuk company aktif; super admin selalu `admin` + hak super admin.
- Urutan hak: `viewer < accountant < admin`. `requireRole(event, 'accountant')` berarti accountant atau admin.
- Semua query data bisnis melewati helper yang memaksa `company_id = activeCompanyId`. Resource milik perusahaan lain → `404`.
- Menu dan tombol dirender berdasarkan role dari `nav.ts` (sumber yang sama dipakai guard route `(app)`).

### Matriks akses (slice ini)

| Fitur | viewer | accountant | admin | super_admin |
|---|---|---|---|---|
| Dashboard, Riwayat Upload, Jurnal, Buku Besar, Neraca Saldo (baca) | ✓ | ✓ | ✓ | ✓ |
| Upload, Review & Konfirmasi, Generate Jurnal, Saldo Awal, buat akun leaf inline | | ✓ | ✓ | ✓ |
| Lihat & buat Category Rules | lihat | ✓ | ✓ | ✓ |
| Hapus upload, hapus rule, CRUD CoA, kelola user perusahaan, edit perusahaan | | | ✓ | ✓ |
| Buat perusahaan, set/cabut super admin | | | | ✓ |

Pengguna & Role: admin membuat user baru (email, nama, password awal) atau menautkan email yang sudah ada ke perusahaan, mengubah role, dan melepas user dari perusahaan. Admin tidak bisa melepas/menurunkan dirinya sendiri bila ia admin terakhir perusahaan.

## 8. Halaman (slice ini)

Sidebar hanya menampilkan menu yang ada di slice ini dan diizinkan untuk role user.

- `/login`
- `/dashboard` — jumlah transaksi pending review, 5 upload terakhir + status, status balance Neraca Saldo bulan berjalan.
- `/uploads/new` — drag-drop PDF, progres (polling), redirect ke detail.
- `/uploads` dan `/uploads/[id]` — list; detail berisi info statement, `balance_warning`, `ai_status`, tabel transaksi, tombol retry (jika `error`), Generate Jurnal (jika `done`), hapus (admin+).
- `/review` — antrian konfirmasi + bulk confirm + modal akun baru.
- `/journal` — Jurnal Umum (tanggal | ref | keterangan | akun | debit | kredit), filter periode.
- `/ledger` — Buku Besar, filter akun + periode.
- `/trial-balance` — Neraca Saldo, filter `as_of`.
- `/settings/company`, `/settings/users`, `/settings/accounts`, `/settings/rules`, `/settings/opening-balance`.
- Company switcher di sidebar; super admin punya tombol "Perusahaan baru".

UI: Tailwind v4 + shadcn-svelte; angka diformat `id-ID` (`1.234.567,89`).

## 9. Error handling

- Format error API: `{ "error": { "code": "snake_case", "message": "Pesan untuk user" } }`. Input divalidasi zod → `400 validation_error` dengan detail field.
- `401` belum login, `403` role kurang, `404` tidak ditemukan / milik perusahaan lain, `409` konflik state (duplikat, belum confirmed, sudah dijurnal), `422` data tidak valid secara domain (PDF, tidak balance), `503` sidecar tidak tersedia.
- Halaman form menampilkan pesan error dari API; error tak terduga dicatat di log server dan ditampilkan sebagai pesan umum.

## 10. Testing

- **Sidecar (pytest)** — `make_fixture.py` membangkitkan PDF sintetis dengan layout BCA (header, tabel, footer) memakai reportlab. Kasus: 1 halaman sederhana; multi-halaman; keterangan multi-baris; campuran DB/CR; baris tanpa saldo; footer tidak cocok → `checksum_mismatch`; PDF bukan BCA → `not_bca`. `test_parser_sample.py` mem-parse `sample/08.pdf` dan memastikan checksum lolos serta jumlah transaksi sama dengan count footer; di-skip bila file tidak ada. Fixture sintetis dibuat saat test (tidak di-commit).
- **App unit (`bun test`)** — `normalize`, pemilihan rule (urutan source/priority/panjang), parsing & validasi respons Ollama (fetch di-mock, termasuk JSON rusak dan kode akun tak dikenal), arah Dr/Cr di `journal/generate`, `money` helper, perhitungan saldo ledger berdasarkan normal balance.
- **App integration (`bun test` + Postgres dari docker compose, DB terpisah `jurnalku_test`)** — isolasi antar perusahaan (404), matriks RBAC per endpoint utama, alur upload (sidecar di-stub) → kategorisasi (Ollama di-stub) → confirm + rule propagasi → generate jurnal → Neraca Saldo balance, saldo awal + peringatan selisih.
- **E2E (Playwright, 1 skenario smoke)** — login → upload PDF sintetis (sidecar asli, Ollama di-stub) → review & confirm → generate jurnal → Neraca Saldo menampilkan "Balance".

## 11. Infra & konfigurasi

- `docker-compose.yml`: `app` (port 3000), `sidecar` (internal 8000), `db` (postgres:16, volume), `ollama` (volume model, `entrypoint.sh` menjalankan `ollama serve` lalu `ollama pull $OLLAMA_MODEL` bila belum ada). Service `app` menjalankan migrasi saat start.
- `.env.example`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SIDECAR_URL`, `OLLAMA_URL`, `OLLAMA_MODEL=qwen2.5:7b`, `SEED_ADMIN_EMAIL=admin@jurnalku.local`, `SEED_ADMIN_PASSWORD`.
- Dev lokal: `docker compose up db sidecar ollama`, lalu `cd app && bun install && bun run db:migrate && bun run db:seed && bun dev`.
- `.gitignore`: `sample/`, `samples/`, `*.pdf`, `.env*` (kecuali `.env.example`), artefak Node/Python/test.
- README: setup guide singkat (Docker & dev lokal), lisensi MIT.
