# PRD — Pembukuan: AI-Powered eStatement Bookkeeping App

> Open source. Self-hosted via Docker. Multi-company. Multi-user + RBAC.
> GitHub: `github.com/jurnalku/jurnalku`

---

## 1. Executive Summary

LedgerAI memungkinkan pengguna mengunggah eStatement bank BCA (PDF), lalu secara otomatis mengklasifikasikan setiap transaksi ke akun akuntansi yang sesuai dan menghasilkan jurnal double-entry beserta laporan keuangan lengkap untuk RUPST — tanpa input manual yang berulang.

AI berbasis Ollama (Qwen2.5:7b) berjalan **lokal di server** — data keuangan tidak pernah keluar dari VPS pengguna.

---

## 2. Tech Stack

| Layer | Teknologi |
|---|---|
| Runtime | Bun |
| Frontend + API | SvelteKit (App Router) |
| Styling | Tailwind CSS v4 + shadcn-svelte |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| PDF Parser | Python + pdfplumber (FastAPI sidecar) |
| AI Inference | Ollama + Qwen2.5:7b (lokal) |
| Auth | Better Auth |
| Container | Docker + Docker Compose |
| Export | xlsx (bun) / CSV |

---

## 3. Deployment

```
docker-compose up -d
```

Services dalam `docker-compose.yml`:
- `app` — SvelteKit + Bun
- `sidecar` — Python FastAPI (PDF parser + Ollama client)
- `db` — PostgreSQL 16
- `ollama` — Ollama server (pull qwen2.5:7b on first run)

Semua service berjalan dalam satu network internal. Tidak ada dependency ke layanan cloud eksternal untuk data transaksi.

---

## 4. User Roles (RBAC)

| Role | Deskripsi |
|---|---|
| `super_admin` | Kelola semua perusahaan, semua user, konfigurasi sistem |
| `admin` | Kelola satu perusahaan: user, CoA, rules |
| `accountant` | Upload statement, kategorisasi, generate jurnal & laporan |
| `viewer` | Hanya baca laporan dan jurnal |

RBAC diterapkan di dua level:
1. **Endpoint level** — middleware cek role sebelum handler
2. **Menu level** — SvelteKit route guard + UI conditional render

---

## 5. Multi-Company

- Satu akun user bisa terhubung ke **banyak perusahaan**
- Setiap perusahaan punya CoA, jurnal, laporan, dan rules sendiri
- User bisa switch perusahaan dari sidebar (company switcher)
- Super admin bisa melihat dan mengelola semua perusahaan

---

## 6. Struktur Menu & Halaman

```
Sidebar Navigation
├── Dashboard                    (semua role)
├── eStatement
│   ├── Upload Baru              (accountant, admin)
│   └── Riwayat Upload           (accountant, admin, viewer)
├── Review & Konfirmasi          (accountant, admin)
├── Jurnal
│   ├── Jurnal Umum              (semua role)
│   └── Export                  (accountant, admin)
├── Buku
│   ├── Buku Besar               (semua role)
│   └── Neraca Saldo             (semua role)
├── Laporan Keuangan
│   ├── Laba Rugi Komprehensif   (semua role)
│   ├── Posisi Keuangan (Neraca) (semua role)
│   ├── Perubahan Ekuitas        (semua role)
│   ├── Arus Kas                 (semua role)
│   └── CALK                    (accountant, admin)
└── Pengaturan
    ├── Perusahaan               (admin, super_admin)
    ├── Pengguna & Role          (admin, super_admin)
    ├── Chart of Accounts        (admin, super_admin)
    ├── Category Rules           (accountant, admin)
    └── Preferensi Sistem        (super_admin)
```

---

## 7. Features & Requirements

### F-01 — Upload eStatement BCA (PDF)
- Terima file PDF dari KlikBCA / m-BCA
- Validasi format sebelum parse
- Kirim ke Python sidecar untuk ekstraksi
- Kolom yang diekstrak: `tanggal`, `keterangan`, `debit`, `kredit`, `saldo`
- Simpan sebagai raw transactions dengan status `unprocessed`

### F-02 — Rule-based Categorization
- Query `category_rules` berdasarkan keyword match (ILIKE)
- Order by `priority DESC`, `source DESC`
- Jika match: assign `account_id`, set `source = 'RULE'`, `confidence = 1.0`
- Instan, tidak butuh LLM

### F-03 — AI Categorization (Ollama Qwen2.5:7b)
- Fallback jika rule tidak match
- Input: deskripsi, jenis (debit/kredit), nominal, daftar akun tersedia
- Output JSON: `{ account_code, confidence, reason }`
- Jika `confidence >= 0.8`: assign, `source = 'AI'`
- Jika `confidence < 0.8`: flag untuk konfirmasi user

### F-04 — Review & Konfirmasi UI
- List transaksi dengan `is_confirmed = false`
- Dropdown pilih akun dari CoA
- Tombol buat akun baru inline
- Setelah konfirmasi: simpan rule baru (`source = 'USER'`, priority tinggi)

### F-05 — Jurnal Umum (Double-Entry)
- Generate dari transaksi `is_confirmed = true`
- Validasi: total debit = total kredit (balanced)
- Format: tanggal | ref | keterangan | akun | debit | kredit
- Tidak bisa generate jika masih ada transaksi unconfirmed

### F-06 — Buku Besar
- Rekap per akun: saldo awal, mutasi debit, mutasi kredit, saldo akhir
- Filter: akun, periode (bulan/tahun)

### F-07 — Neraca Saldo (Trial Balance)
- Semua akun dengan total debit dan kredit
- Validasi otomatis: total debit = total kredit

### F-08 — Laporan Laba Rugi Komprehensif
- Format vertikal PSAK
- Pendapatan → HPP → Laba Kotor → Beban Operasional → Laba Operasional → Pendapatan/Beban Lain → Laba Sebelum Pajak → Pajak → Laba Bersih

### F-09 — Laporan Posisi Keuangan (Neraca)
- Format vertikal PSAK
- Aset Lancar → Aset Tidak Lancar → Total Aset
- Liabilitas Jangka Pendek → Jangka Panjang → Total Liabilitas
- Ekuitas → Total Liabilitas + Ekuitas
- Validasi: Total Aset = Total Liabilitas + Ekuitas

### F-10 — Laporan Perubahan Ekuitas
- Modal awal + Laba bersih + Dividen/Distribusi = Modal akhir
- Input manual: modal awal, dividen (jika belum ada di transaksi)

### F-11 — Laporan Arus Kas
- Metode tidak langsung (indirect method)
- Tiga seksi: Operasional, Investasi, Pendanaan
- Klasifikasi per akun dikonfigurasi di pengaturan CoA
- Rekonsiliasi: kas awal + net cash flow = kas akhir

### F-12 — CALK (Catatan atas Laporan Keuangan)
- Template default mengikuti struktur PSAK umum
- Note yang auto-populated dari data jurnal:
  - Note Kas & Setara Kas
  - Note Piutang Usaha (dengan aging schedule)
  - Note Aset Tetap (dengan tabel penyusutan)
  - Note Utang Usaha
- Note yang semi-manual (rich text editor):
  - Note 1: Gambaran Umum Perusahaan
  - Note 2: Ikhtisar Kebijakan Akuntansi
  - Note lainnya sesuai kebutuhan
- Export CALK sebagai bagian dari paket laporan keuangan

### F-13 — Export
- Jurnal Umum: CSV / Excel
- Semua laporan keuangan: Excel (satu file, multi-sheet) / PDF
- Paket RUPST: ZIP berisi semua laporan + CALK

### F-14 — Chart of Accounts (CoA)
- Default CoA PSAK format vertikal (lihat Seeder)
- CRUD akun: kode, nama, tipe, normal balance, parent (hierarki)
- Akun tidak bisa dihapus jika sudah ada jurnal yang menggunakannya
- Konfigurasi arus kas per akun (operasional/investasi/pendanaan)

### F-15 — Category Rules
- CRUD rules: keyword pattern, akun tujuan, prioritas
- Source: SYSTEM (bawaan) | USER (dari konfirmasi)
- Rules USER selalu prioritas lebih tinggi dari SYSTEM

---

## 8. User Flow

```
Upload PDF BCA
      │
      ▼
Parse & Ekstrak Transaksi (Python sidecar)
      │
      ▼
Rule-based Matching ──(match)──► Kategori Otomatis ✓
      │ (no match)
      ▼
AI Qwen2.5 lokal ──(conf ≥ 0.8)──► Kategori AI ✓
      │ (conf < 0.8)
      ▼
Flag → Antrian Konfirmasi User
      │
      ▼ (user pilih akun)
Simpan Rule Baru + Kategori Dikonfirmasi ✓
      │
      ▼
Generate Jurnal Double-Entry
      │
      ▼
Buku Besar → Neraca Saldo → Laporan Keuangan → CALK
      │
      ▼
Export Paket RUPST (Excel + PDF + ZIP)
```

---

## 9. Database Schema

```sql
-- =============================================
-- MULTI-COMPANY & AUTH
-- =============================================

CREATE TABLE companies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  npwp         VARCHAR(20),
  address      TEXT,
  fiscal_year  VARCHAR(10) DEFAULT 'JANUARY', -- bulan awal tahun fiskal
  currency     VARCHAR(5) DEFAULT 'IDR',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'accountant', 'viewer');

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  password     TEXT NOT NULL, -- hashed
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_companies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  role         user_role NOT NULL,
  UNIQUE(user_id, company_id)
);

-- =============================================
-- CHART OF ACCOUNTS
-- =============================================

CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE normal_balance AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE cash_flow_category AS ENUM ('OPERATING', 'INVESTING', 'FINANCING');

CREATE TABLE accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
  code              VARCHAR(20) NOT NULL,
  name              TEXT NOT NULL,
  type              account_type NOT NULL,
  normal_bal        normal_balance NOT NULL,
  parent_id         UUID REFERENCES accounts(id),
  cash_flow_cat     cash_flow_category, -- untuk laporan arus kas
  is_active         BOOLEAN DEFAULT true,
  UNIQUE(company_id, code)
);

-- =============================================
-- CATEGORY RULES (LEARNING ENGINE)
-- =============================================

CREATE TYPE rule_source AS ENUM ('SYSTEM', 'USER');

CREATE TABLE category_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  keyword_pattern TEXT NOT NULL,
  account_id      UUID REFERENCES accounts(id),
  priority        INTEGER DEFAULT 0,
  source          rule_source DEFAULT 'SYSTEM',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- STATEMENT & TRANSACTIONS
-- =============================================

CREATE TYPE upload_status AS ENUM ('processing', 'review', 'done', 'error');
CREATE TYPE tx_source AS ENUM ('RULE', 'AI', 'USER');

CREATE TABLE statement_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by   UUID REFERENCES users(id),
  filename      TEXT NOT NULL,
  bank          VARCHAR(20) DEFAULT 'BCA',
  period_start  DATE,
  period_end    DATE,
  status        upload_status DEFAULT 'processing',
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id      UUID REFERENCES statement_uploads(id) ON DELETE CASCADE,
  company_id     UUID REFERENCES companies(id),
  txn_date       DATE NOT NULL,
  description    TEXT NOT NULL,
  debit          NUMERIC(18,2) DEFAULT 0,
  credit         NUMERIC(18,2) DEFAULT 0,
  balance        NUMERIC(18,2),
  account_id     UUID REFERENCES accounts(id),
  is_confirmed   BOOLEAN DEFAULT false,
  ai_confidence  NUMERIC(4,3),
  source         tx_source,
  confirmed_by   UUID REFERENCES users(id),
  confirmed_at   TIMESTAMPTZ
);

-- =============================================
-- JOURNAL (DOUBLE-ENTRY)
-- =============================================

CREATE TABLE journal_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),
  transaction_id  UUID REFERENCES transactions(id),
  entry_date      DATE NOT NULL,
  description     TEXT,
  ref_no          VARCHAR(50),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE journal_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id  UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id  UUID REFERENCES accounts(id),
  debit       NUMERIC(18,2) DEFAULT 0,
  credit      NUMERIC(18,2) DEFAULT 0
);

-- =============================================
-- LAPORAN KEUANGAN — INPUT TAMBAHAN
-- =============================================

CREATE TABLE equity_adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id),
  period      VARCHAR(7) NOT NULL, -- 'YYYY-MM'
  description TEXT,
  amount      NUMERIC(18,2),
  type        VARCHAR(20) -- 'INITIAL_CAPITAL' | 'DIVIDEND' | 'OTHER'
);

-- =============================================
-- CALK (CATATAN ATAS LAPORAN KEUANGAN)
-- =============================================

CREATE TABLE calk_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id),
  period      VARCHAR(7) NOT NULL, -- 'YYYY-MM'
  note_order  INTEGER NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT, -- rich text / markdown
  is_auto     BOOLEAN DEFAULT false, -- true = di-generate dari data
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 10. API Endpoints

### Auth
| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Login |
| `POST` | `/api/auth/logout` | All | Logout |
| `GET` | `/api/auth/me` | All | Current user + companies |

### Companies
| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| `GET` | `/api/companies` | All | List perusahaan milik user |
| `POST` | `/api/companies` | super_admin | Buat perusahaan baru |
| `PATCH` | `/api/companies/:id` | admin | Update info perusahaan |

### Users & RBAC
| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| `GET` | `/api/users` | admin+ | List user dalam perusahaan |
| `POST` | `/api/users/invite` | admin+ | Invite user baru |
| `PATCH` | `/api/users/:id/role` | admin+ | Ubah role user |
| `DELETE` | `/api/users/:id` | admin+ | Hapus user dari perusahaan |

### Chart of Accounts
| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| `GET` | `/api/accounts` | All | List CoA |
| `POST` | `/api/accounts` | admin+ | Buat akun baru |
| `PATCH` | `/api/accounts/:id` | admin+ | Update akun |
| `DELETE` | `/api/accounts/:id` | admin+ | Nonaktifkan akun |

### eStatement
| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| `POST` | `/api/uploads` | accountant+ | Upload PDF BCA |
| `GET` | `/api/uploads` | All | List riwayat upload |
| `GET` | `/api/uploads/:id` | All | Detail upload + transaksi |
| `POST` | `/api/uploads/:id/categorize` | accountant+ | Jalankan pipeline rule→AI |
| `DELETE` | `/api/uploads/:id` | admin+ | Hapus upload |

### Transactions
| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| `GET` | `/api/transactions` | All | List transaksi (filter: upload, status, akun) |
| `PATCH` | `/api/transactions/:id/confirm` | accountant+ | Konfirmasi kategori |

### Journal
| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| `POST` | `/api/journal/generate` | accountant+ | Generate jurnal dari transaksi confirmed |
| `GET` | `/api/journal` | All | List jurnal entries |
| `GET` | `/api/journal/export` | accountant+ | Export CSV / Excel |

### Laporan Keuangan
| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| `GET` | `/api/reports/ledger` | All | Buku besar per akun |
| `GET` | `/api/reports/trial-balance` | All | Neraca saldo |
| `GET` | `/api/reports/income-statement` | All | Laporan laba rugi |
| `GET` | `/api/reports/balance-sheet` | All | Neraca posisi keuangan |
| `GET` | `/api/reports/equity-changes` | All | Laporan perubahan ekuitas |
| `GET` | `/api/reports/cash-flow` | All | Laporan arus kas |
| `GET` | `/api/reports/export` | accountant+ | Export paket Excel multi-sheet |
| `GET` | `/api/reports/rupst-package` | accountant+ | ZIP paket RUPST lengkap |

### CALK
| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| `GET` | `/api/calk/:period` | All | List semua notes CALK periode tertentu |
| `PUT` | `/api/calk/:period/:noteId` | accountant+ | Update isi note |
| `POST` | `/api/calk/:period/generate` | accountant+ | Auto-populate notes dari data jurnal |

### Category Rules
| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| `GET` | `/api/rules` | All | List rules |
| `POST` | `/api/rules` | admin+ | Buat rule manual |
| `DELETE` | `/api/rules/:id` | admin+ | Hapus rule |

---

## 11. AI Categorization Pipeline

```python
# sidecar/categorize.py

async def categorize(description: str, amount: float, is_debit: bool, company_id: str):
    
    # LAPIS 1: Rule-based
    rule = await db.fetch_one("""
        SELECT account_id FROM category_rules
        WHERE company_id = $1
          AND $2 ILIKE '%' || keyword_pattern || '%'
        ORDER BY source DESC, priority DESC
        LIMIT 1
    """, company_id, description)
    
    if rule:
        return { "account_id": rule.account_id, "source": "RULE", "confidence": 1.0 }

    # LAPIS 2: AI (Ollama Qwen2.5:7b)
    accounts = await get_accounts(company_id)
    prompt = build_prompt(description, amount, is_debit, accounts)
    
    response = ollama.chat(model="qwen2.5:7b", messages=[
        {"role": "user", "content": prompt}
    ])
    
    result = json.loads(response.message.content)
    
    if result["confidence"] >= 0.8:
        return { **result, "source": "AI" }
    
    # LAPIS 3: Flag untuk konfirmasi user
    return { "source": "PENDING", "confidence": result["confidence"] }
```

---

## 12. Seeder

Seeder dijalankan dengan:
```bash
bun run db:seed
```

### Seeder 1 — Default Company & Super Admin
```typescript
// seeds/01_admin.ts
await db.insert(users).values({
  email: 'admin@ledgerai.local',
  name:  'Super Admin',
  password: await hash('admin123'), // ganti di .env
})

await db.insert(companies).values({
  name: 'PT Demo Perusahaan',
  npwp: '00.000.000.0-000.000',
  fiscal_year: 'JANUARY',
  currency: 'IDR',
})

// assign super_admin ke perusahaan demo
await db.insert(user_companies).values({
  user_id: adminId,
  company_id: companyId,
  role: 'super_admin',
})
```

### Seeder 2 — Chart of Accounts PSAK (Format Vertikal)
```typescript
// seeds/02_coa.ts
// Format: { code, name, type, normal_bal, parent_code? }

const defaultCOA = [
  // ── ASET ──
  { code: '1-0000', name: 'ASET',                          type: 'ASSET',     normal_bal: 'DEBIT' },
  { code: '1-1000', name: 'Aset Lancar',                   type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-0000' },
  { code: '1-1001', name: 'Kas',                           type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-1000' },
  { code: '1-1002', name: 'Bank BCA',                      type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-1000' },
  { code: '1-1003', name: 'Piutang Usaha',                 type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-1000' },
  { code: '1-1004', name: 'Piutang Lain-lain',             type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-1000' },
  { code: '1-1005', name: 'Persediaan',                    type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-1000' },
  { code: '1-1006', name: 'Beban Dibayar Dimuka',          type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-1000' },
  { code: '1-1007', name: 'Pajak Dibayar Dimuka',          type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-1000' },
  { code: '1-2000', name: 'Aset Tidak Lancar',             type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-0000' },
  { code: '1-2001', name: 'Investasi Jangka Panjang',      type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-2000' },
  { code: '1-2100', name: 'Aset Tetap',                    type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-2000' },
  { code: '1-2101', name: 'Tanah',                         type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-2100' },
  { code: '1-2102', name: 'Bangunan',                      type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-2100' },
  { code: '1-2103', name: 'Kendaraan',                     type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-2100' },
  { code: '1-2104', name: 'Peralatan & Mesin',             type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-2100' },
  { code: '1-2105', name: 'Inventaris Kantor',             type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-2100' },
  { code: '1-2200', name: 'Akumulasi Penyusutan',          type: 'ASSET',     normal_bal: 'CREDIT', parent: '1-2000' },
  { code: '1-2201', name: 'Akum. Penyusutan Bangunan',     type: 'ASSET',     normal_bal: 'CREDIT', parent: '1-2200' },
  { code: '1-2202', name: 'Akum. Penyusutan Kendaraan',    type: 'ASSET',     normal_bal: 'CREDIT', parent: '1-2200' },
  { code: '1-2203', name: 'Akum. Penyusutan Peralatan',    type: 'ASSET',     normal_bal: 'CREDIT', parent: '1-2200' },
  { code: '1-2204', name: 'Akum. Penyusutan Inventaris',   type: 'ASSET',     normal_bal: 'CREDIT', parent: '1-2200' },
  { code: '1-3000', name: 'Aset Tak Berwujud',             type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-0000' },
  { code: '1-3001', name: 'Goodwill',                      type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-3000' },
  { code: '1-3002', name: 'Hak Paten & Lisensi',           type: 'ASSET',     normal_bal: 'DEBIT',  parent: '1-3000' },

  // ── LIABILITAS ──
  { code: '2-0000', name: 'LIABILITAS',                    type: 'LIABILITY', normal_bal: 'CREDIT' },
  { code: '2-1000', name: 'Liabilitas Jangka Pendek',      type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-0000' },
  { code: '2-1001', name: 'Utang Usaha',                   type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-1000' },
  { code: '2-1002', name: 'Utang Pajak',                   type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-1000' },
  { code: '2-1003', name: 'Utang PPh 21',                  type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-1000' },
  { code: '2-1004', name: 'Utang PPh 23',                  type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-1000' },
  { code: '2-1005', name: 'Utang PPN',                     type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-1000' },
  { code: '2-1006', name: 'Beban Akrual',                  type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-1000' },
  { code: '2-1007', name: 'Pendapatan Diterima Dimuka',    type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-1000' },
  { code: '2-1008', name: 'Utang Bank Jangka Pendek',      type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-1000' },
  { code: '2-2000', name: 'Liabilitas Jangka Panjang',     type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-0000' },
  { code: '2-2001', name: 'Utang Bank Jangka Panjang',     type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-2000' },
  { code: '2-2002', name: 'Liabilitas Imbalan Kerja',      type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-2000' },
  { code: '2-2003', name: 'Utang Obligasi',                type: 'LIABILITY', normal_bal: 'CREDIT', parent: '2-2000' },

  // ── EKUITAS ──
  { code: '3-0000', name: 'EKUITAS',                       type: 'EQUITY',    normal_bal: 'CREDIT' },
  { code: '3-1001', name: 'Modal Saham Disetor',           type: 'EQUITY',    normal_bal: 'CREDIT', parent: '3-0000' },
  { code: '3-1002', name: 'Tambahan Modal Disetor (APIC)', type: 'EQUITY',    normal_bal: 'CREDIT', parent: '3-0000' },
  { code: '3-1003', name: 'Saldo Laba Ditahan',            type: 'EQUITY',    normal_bal: 'CREDIT', parent: '3-0000' },
  { code: '3-1004', name: 'Laba Tahun Berjalan',           type: 'EQUITY',    normal_bal: 'CREDIT', parent: '3-0000' },
  { code: '3-1005', name: 'Dividen',                       type: 'EQUITY',    normal_bal: 'DEBIT',  parent: '3-0000' },

  // ── PENDAPATAN ──
  { code: '4-0000', name: 'PENDAPATAN',                    type: 'REVENUE',   normal_bal: 'CREDIT' },
  { code: '4-1000', name: 'Pendapatan Usaha',              type: 'REVENUE',   normal_bal: 'CREDIT', parent: '4-0000' },
  { code: '4-1001', name: 'Pendapatan Jasa',               type: 'REVENUE',   normal_bal: 'CREDIT', parent: '4-1000' },
  { code: '4-1002', name: 'Pendapatan Penjualan',          type: 'REVENUE',   normal_bal: 'CREDIT', parent: '4-1000' },
  { code: '4-1003', name: 'Retur & Potongan Penjualan',    type: 'REVENUE',   normal_bal: 'DEBIT',  parent: '4-1000' },
  { code: '4-2000', name: 'Pendapatan Lain-lain',          type: 'REVENUE',   normal_bal: 'CREDIT', parent: '4-0000' },
  { code: '4-2001', name: 'Pendapatan Bunga',              type: 'REVENUE',   normal_bal: 'CREDIT', parent: '4-2000' },
  { code: '4-2002', name: 'Keuntungan Penjualan Aset',     type: 'REVENUE',   normal_bal: 'CREDIT', parent: '4-2000' },

  // ── BEBAN ──
  { code: '5-0000', name: 'BEBAN',                         type: 'EXPENSE',   normal_bal: 'DEBIT' },
  { code: '5-1000', name: 'Harga Pokok Penjualan (HPP)',   type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-0000' },
  { code: '5-1001', name: 'HPP — Bahan Baku',              type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-1000' },
  { code: '5-1002', name: 'HPP — Tenaga Kerja Langsung',   type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-1000' },
  { code: '5-1003', name: 'HPP — Overhead Pabrik',         type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-1000' },
  { code: '5-2000', name: 'Beban Operasional',             type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-0000' },
  { code: '5-2001', name: 'Beban Gaji & Tunjangan',        type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2002', name: 'Beban BPJS',                    type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2003', name: 'Beban Sewa',                    type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2004', name: 'Beban Listrik & Air',           type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2005', name: 'Beban Telepon & Internet',      type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2006', name: 'Beban Pemasaran & Iklan',       type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2007', name: 'Beban Perjalanan Dinas',        type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2008', name: 'Beban Perlengkapan Kantor',     type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2009', name: 'Beban Penyusutan',              type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2010', name: 'Beban Administrasi Bank',       type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2011', name: 'Beban Asuransi',                type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2012', name: 'Beban Pemeliharaan & Reparasi', type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-2013', name: 'Beban Konsultan & Profesional', type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-2000' },
  { code: '5-3000', name: 'Beban Lain-lain',               type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-0000' },
  { code: '5-3001', name: 'Beban Bunga',                   type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-3000' },
  { code: '5-3002', name: 'Kerugian Penjualan Aset',       type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-3000' },
  { code: '5-3003', name: 'Beban Pajak Penghasilan',       type: 'EXPENSE',   normal_bal: 'DEBIT',  parent: '5-3000' },
]
```

### Seeder 3 — Default Category Rules (SYSTEM)
```typescript
// seeds/03_rules.ts
const defaultRules = [
  // Bank & Admin
  { keyword: 'BIAYA ADM',          account: '5-2010' },
  { keyword: 'BI-FAST',            account: '5-2010' },
  { keyword: 'PROVISI',            account: '5-2010' },
  { keyword: 'BUNGA PINJAMAN',     account: '5-3001' },
  { keyword: 'BUNGA TABUNGAN',     account: '4-2001' },
  // Marketplace / E-commerce
  { keyword: 'TOKOPEDIA',          account: '4-1002' },
  { keyword: 'SHOPEE',             account: '4-1002' },
  { keyword: 'LAZADA',             account: '4-1002' },
  { keyword: 'BUKALAPAK',          account: '4-1002' },
  // Ride & Delivery
  { keyword: 'GOJEK',              account: '5-2006' },
  { keyword: 'GRAB',               account: '5-2006' },
  // Utilitas
  { keyword: 'PLN',                account: '5-2004' },
  { keyword: 'PDAM',               account: '5-2004' },
  { keyword: 'TELKOM',             account: '5-2005' },
  { keyword: 'INDOSAT',            account: '5-2005' },
  { keyword: 'XL AXIATA',          account: '5-2005' },
  // BPJS
  { keyword: 'BPJS KESEHATAN',     account: '5-2002' },
  { keyword: 'BPJS KETENAGAKERJAAN', account: '5-2002' },
  // Retail
  { keyword: 'ALFAMART',           account: '5-2008' },
  { keyword: 'INDOMARET',          account: '5-2008' },
]
```

### Seeder 4 — Default CALK Template
```typescript
// seeds/04_calk_template.ts
const calkTemplate = [
  { order: 1,  title: 'Gambaran Umum Perusahaan',                is_auto: false },
  { order: 2,  title: 'Ikhtisar Kebijakan Akuntansi Signifikan', is_auto: false },
  { order: 3,  title: 'Kas dan Setara Kas',                      is_auto: true  },
  { order: 4,  title: 'Piutang Usaha',                           is_auto: true  },
  { order: 5,  title: 'Persediaan',                              is_auto: true  },
  { order: 6,  title: 'Aset Tetap',                              is_auto: true  },
  { order: 7,  title: 'Utang Usaha',                             is_auto: true  },
  { order: 8,  title: 'Utang Bank',                              is_auto: true  },
  { order: 9,  title: 'Modal Saham',                             is_auto: false },
  { order: 10, title: 'Pendapatan',                              is_auto: true  },
  { order: 11, title: 'Beban Usaha',                             is_auto: true  },
  { order: 12, title: 'Pajak Penghasilan',                       is_auto: false },
  { order: 13, title: 'Transaksi dengan Pihak Berelasi',         is_auto: false },
  { order: 14, title: 'Peristiwa Setelah Periode Pelaporan',     is_auto: false },
]
```

---

## 13. Struktur Project

```
ledgerai/
├── docker-compose.yml
├── .env.example
├── README.md
│
├── app/                          # SvelteKit + Bun
│   ├── src/
│   │   ├── lib/
│   │   │   ├── db/
│   │   │   │   ├── index.ts      # Drizzle client
│   │   │   │   └── schema.ts     # semua tabel
│   │   │   ├── server/
│   │   │   │   ├── auth.ts       # Better Auth config
│   │   │   │   └── rbac.ts       # middleware RBAC
│   │   │   └── components/ui/    # shadcn-svelte
│   │   ├── routes/
│   │   │   ├── (auth)/           # login, register
│   │   │   ├── (app)/            # semua halaman utama
│   │   │   │   ├── dashboard/
│   │   │   │   ├── uploads/
│   │   │   │   ├── review/
│   │   │   │   ├── journal/
│   │   │   │   ├── ledger/       # buku besar
│   │   │   │   ├── reports/      # semua laporan
│   │   │   │   ├── calk/
│   │   │   │   └── settings/
│   │   │   └── api/              # API endpoints
│   │   └── hooks.server.ts       # auth + RBAC guard
│   ├── drizzle/migrations/
│   ├── seeds/
│   │   ├── 01_admin.ts
│   │   ├── 02_coa.ts
│   │   ├── 03_rules.ts
│   │   └── 04_calk_template.ts
│   ├── drizzle.config.ts
│   ├── package.json
│   └── bunfig.toml
│
├── sidecar/                      # Python FastAPI
│   ├── main.py
│   ├── parser.py                 # pdfplumber ekstrak BCA
│   ├── categorizer.py            # rule → AI pipeline
│   ├── ollama_client.py
│   ├── requirements.txt
│   └── Dockerfile
│
└── samples/                      # eStatement BCA sample untuk dev & testing
    └── statement_sample.pdf      # letakkan file PDF BCA di sini
│
└── ollama/
    └── Modelfile                 # pull qwen2.5:7b on init
```

---

## 14. Non-Functional Requirements

| Aspek | Requirement |
|---|---|
| **Privasi** | Data transaksi 100% lokal; zero API call ke pihak ketiga |
| **Performa** | Parse + kategorisasi ≤ 500 transaksi selesai < 2 menit |
| **Akurasi** | Jurnal selalu balanced; validasi sebelum simpan |
| **Keamanan** | PDF dihapus setelah di-parse; password di-hash (argon2) |
| **Auditability** | Setiap transaksi menyimpan source + confidence + confirmed_by |
| **Konsistensi** | Semua angka `NUMERIC(18,2)` — tidak ada floating point error |
| **Docker** | Satu `docker-compose up -d` untuk semua services |
| **Open Source** | MIT License; README lengkap dengan setup guide |

---

## 15. Milestones

| Phase | Scope | Estimasi |
|---|---|---|
| **Phase 0** | Repo setup, Docker Compose, DB schema, semua seeder | 1 minggu |
| **Phase 1** | Auth (login/register), RBAC middleware, company switcher | 1 minggu |
| **Phase 2** | Upload PDF, Python sidecar parser BCA | 1 minggu |
| **Phase 3** | Rule-based + AI categorization pipeline, Review UI | 2 minggu |
| **Phase 4** | Jurnal Umum, Buku Besar, Neraca Saldo | 1 minggu |
| **Phase 5** | Laporan Keuangan (L/R, Neraca, Perubahan Ekuitas, Arus Kas) | 2 minggu |
| **Phase 6** | CALK (template + rich text editor + auto-populate) | 1 minggu |
| **Phase 7** | Export (Excel multi-sheet, PDF, ZIP RUPST package) | 1 minggu |
| **Phase 8** | Polish, testing, dokumentasi, README GitHub | 1 minggu |

**Total estimasi: ~11 minggu**

---

## 16. Sample eStatement BCA

File sample disimpan di root project:
```
samples/statement_sample.pdf
```

Gunakan untuk:
1. Analisis struktur tabel PDF BCA oleh parser
2. Validasi akurasi ekstraksi kolom (tanggal, keterangan, debit, kredit, saldo)
3. Test case otomatis saat development

> ⚠️ Tambahkan `samples/` ke `.gitignore` — jangan commit data keuangan ke GitHub.

---

## 17. Urutan Implementasi untuk Claude Code

```
1. docker-compose.yml + .env.example + .gitignore
2. app/src/lib/db/schema.ts (Drizzle schema lengkap)
3. drizzle migrate + semua seeds (01–04)
4. Better Auth setup + RBAC middleware
5. sidecar/parser.py (pdfplumber BCA)
6. sidecar/categorizer.py (rule → Ollama pipeline)
7. API routes: uploads, transactions, categorize, confirm
8. SvelteKit pages: upload, review & konfirmasi
9. API routes: journal generate + export
10. SvelteKit pages: jurnal, buku besar, neraca saldo
11. API routes: semua laporan keuangan
12. SvelteKit pages: semua laporan
13. CALK: API + rich text editor UI
14. Export: Excel multi-sheet + ZIP RUPST
15. Settings: CoA, Rules, Users, Company
16. Testing + README
```
