# Jurnalku Core Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun alur inti Jurnalku end-to-end: upload eStatement BCA (PDF) → parse → kategorisasi rule → AI lokal → review & konfirmasi → jurnal double-entry → Buku Besar → Neraca Saldo, dengan multi-company, RBAC, dan Docker Compose.

**Architecture:** Monorepo dengan dua aplikasi. `sidecar/` (Python FastAPI + pdfplumber) adalah parser PDF stateless, tanpa DB dan tanpa AI. `app/` (SvelteKit + Bun) memiliki seluruh logika bisnis: Drizzle/Postgres, Better Auth, RBAC, rule engine, client Ollama, job runner in-process, jurnal & laporan. UI memanggil service server-side lewat `+page.server.ts` untuk baca, dan endpoint `/api/*` (JSON) untuk tulis.

**Tech Stack:** Bun 1.3.10, SvelteKit 2.70.3 + Svelte 5.57.1, Vite 7.3.6, svelte-adapter-bun 1.0.1, Tailwind CSS 4.3.3 + shadcn-svelte 1.7.0, Drizzle ORM 0.45.3 + drizzle-kit 0.31.11, postgres.js 3.4.9, Better Auth 1.7.6, zod 4.6.5, decimal.js 10.6.0, Playwright 1.63.0; Python 3.12, FastAPI 0.143.0, pdfplumber 0.11.10, reportlab 5.0.1 (test), pytest 9.1.1; Postgres 16; Ollama 0.34.4 + qwen2.5:7b.

**Spec:** `docs/superpowers/specs/2026-10-11-jurnalku-core-slice-design.md` (baca dulu; plan ini mengimplementasikannya).

## Global Constraints

- Nama produk di semua kode, UI, dan dokumen: **Jurnalku**. Seed email default `admin@jurnalku.local`.
- Bahasa UI dan pesan error: Bahasa Indonesia. Format angka di UI: `id-ID` (`1.234.567,89`) via `formatIdr`.
- Uang: `NUMERIC(18,2)` di DB, string di TS, hitung hanya dengan `decimal.js` (`src/lib/money.ts`). Python: `Decimal`. **Tidak pernah `number`/float untuk uang.**
- Tanggal di DB: `date` dengan `mode: 'string'` (`YYYY-MM-DD`).
- Modul di `app/src/lib/server/**` hanya memakai **import relatif** (tanpa `$lib`, `$app`, `$env`), kecuali `auth.ts`, supaya bisa dijalankan oleh `bun test`, `seeds/index.ts`, dan `migrate.ts` di luar Vite. Route (`src/routes/**`) boleh memakai `$lib/...`.
- Env dibaca dari `process.env` lewat `src/lib/server/env.ts`. Dev: `bun --bun vite dev` (Bun memuat `app/.env` otomatis).
- Format error API: `{ "error": { "code": "snake_case", "message": "..." , "details"?: ... } }` via `apiHandler`.
- Resource milik perusahaan lain → **404**, bukan 403.
- Role per perusahaan: `viewer < accountant < admin`; `super_admin` = flag global `user.is_super_admin` (role efektif `admin` di semua perusahaan).
- Hanya hasil RULE yang auto-confirmed; hasil AI selalu menunggu konfirmasi manusia.
- PDF tidak pernah ditulis ke disk oleh app maupun sidecar (diproses di memori).
- `sample/`, `samples/`, `*.pdf`, `.env*` (kecuali `.env.example`) tidak boleh masuk git. Test yang di-commit hanya memakai PDF sintetis yang dibangkitkan saat test.
- Versi dependency dipin persis seperti di Tech Stack (tanpa `^`).
- Setiap commit diakhiri baris: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

### Penyesuaian spec yang dikunci oleh plan ini
- **D11 — Arah rule.** `category_rules` mendapat kolom `direction` (`DB | CR | NULL`). Rule hanya cocok bila `direction IS NULL` atau sama dengan arah transaksi. Alasan: rule seed PRD seperti `TOKOPEDIA → Pendapatan Penjualan` salah bila diterapkan ke uang keluar. Rule seed diberi arah; rule USER mewarisi arah transaksi yang dikonfirmasi. Rule seed `BI-FAST` **dihapus** karena teks itu muncul pada transfer masuk bernilai besar (akan salah tercatat sebagai beban admin bank).
- **D12 — Tanpa file temp.** PDF diteruskan dari memori ke sidecar; tidak ada file temp sama sekali (lebih ketat dari spec §6.1 langkah 2).
- **D13 — Lokasi data seed.** Data CoA & rule ada di `app/src/lib/server/company/{coa-data,rules-data}.ts` (dipakai runtime saat membuat perusahaan baru); `app/seeds/index.ts` hanya CLI.

## Review Focus

1. **Kata `DB` di dalam keterangan** (mis. `TRSF E-BANKING DB ...`) pada transaksi kredit — arah harus tetap `CR`; hanya token `DB` di kolom mutasi yang menentukan arah. → test di Task 1.
2. **Statement tanpa transaksi** (hanya `SALDO AWAL`, mutasi 0) — parse sukses, upload tersimpan, status langsung `done`, tidak crash. → test di Task 1 dan Task 11.
3. **Keyword rule berisi karakter wildcard SQL** (`%`, `_`, mis. `DISKON 50%`) — dicocokkan literal, tidak menjadi wildcard. → test di Task 8.
4. **Klik ganda "Generate Jurnal"** (dua request bersamaan) — tidak ada entry ganda maupun nomor referensi bentrok. → test di Task 13.
5. **Cookie perusahaan aktif dimanipulasi** ke ID perusahaan yang bukan milik user — jatuh ke perusahaan milik user sendiri, tidak bocor. → test di Task 6.

---

## File Structure

```
jurnalku/
├── .gitignore                         (sudah ada)
├── docker-compose.yml                 Task 4 (db), Task 20 (lengkap)
├── .env.example                       Task 20
├── README.md                          Task 20
├── docker/db-init/01-test-db.sql      Task 4 — buat DB jurnalku_test
├── ollama/entrypoint.sh               Task 20
├── sidecar/
│   ├── requirements.txt / requirements-dev.txt / Dockerfile     Task 1–2
│   ├── bca_parser.py                  Task 1 — PDF → BcaStatement
│   ├── main.py                        Task 2 — FastAPI /parse /health
│   └── tests/{conftest.py,make_fixture.py,test_parser_synthetic.py,test_parser_sample.py,test_api.py}
└── app/
    ├── package.json, bunfig.toml, svelte.config.js, vite.config.ts, tsconfig.json,
    │   drizzle.config.ts, components.json, Dockerfile, playwright.config.ts
    ├── drizzle/migrations/            Task 4 (generated)
    ├── seeds/index.ts                 Task 5
    ├── src/
    │   ├── app.css, app.html, app.d.ts, hooks.server.ts
    │   ├── lib/
    │   │   ├── money.ts               Task 3 — decimal helpers + formatIdr (client & server)
    │   │   ├── roles.ts               Task 6 — Role, roleAtLeast (client & server)
    │   │   ├── nav.ts                 Task 7 — menu + minRoleForPath
    │   │   ├── api-client.ts          Task 14 — apiFetch (client)
    │   │   ├── ui.ts                  Task 14 — kelas CSS untuk select/textarea native
    │   │   ├── components/ui/*        Task 3 — shadcn-svelte (generated)
    │   │   ├── components/{PageHeader,MoneyCell,StatusBadge}.svelte   Task 14
    │   │   └── server/
    │   │       ├── env.ts, password.ts, api.ts, validation.ts, rbac.ts, auth.ts
    │   │       ├── db/{schema,index,migrate,errors}.ts
    │   │       ├── users/{create,service}.ts
    │   │       ├── company/{coa-data,rules-data,seed-company,service}.ts
    │   │       ├── accounts/{queries,service}.ts
    │   │       ├── categorize/{normalize,rules,ollama,pipeline}.ts
    │   │       ├── uploads/{sidecar-client,service,status}.ts
    │   │       ├── jobs.ts
    │   │       ├── transactions/{confirm,queries}.ts
    │   │       ├── rules/service.ts
    │   │       ├── ledger/balance.ts
    │   │       ├── journal/{lines,opening,generate,queries}.ts
    │   │       └── reports/{ledger,trial-balance}.ts
    │   └── routes/
    │       ├── +layout.svelte, +page.server.ts (redirect)
    │       ├── login/{+page.svelte,+page.server.ts}
    │       ├── logout/+server.ts
    │       ├── (app)/+layout.{svelte,server.ts}
    │       ├── (app)/{dashboard,uploads,uploads/new,uploads/[id],review,journal,ledger,trial-balance}/
    │       ├── (app)/settings/{company,users,accounts,rules,opening-balance}/
    │       └── api/**                 (endpoint JSON per task)
    └── tests/
        ├── setup.ts                   Task 4 — preload env test
        ├── unit/*.test.ts
        ├── integration/{db,factory,event}.ts + *.test.ts
        └── e2e/{global-setup.ts,ollama-stub.ts,smoke.spec.ts}
```

---

### Task 1: Sidecar — parser BCA

**Files:**
- Create: `sidecar/requirements.txt`, `sidecar/requirements-dev.txt`, `sidecar/bca_parser.py`
- Create: `sidecar/tests/__init__.py` (kosong), `sidecar/tests/conftest.py`, `sidecar/tests/make_fixture.py`
- Test: `sidecar/tests/test_parser_synthetic.py`, `sidecar/tests/test_parser_sample.py`

**Interfaces:**
- Produces: `parse_bca(pdf_bytes: bytes) -> BcaStatement`; `BcaStatement.to_dict() -> dict` (bentuk JSON spec §5); `ParseError(reason: "not_bca"|"checksum_mismatch"|"unreadable", detail: str)`.
- Produces (test util, dipakai Task 2 & Task 21): `make_fixture.build_pdf(st: Statement) -> bytes`, `make_fixture.simple_statement() -> Statement`; CLI `python tests/make_fixture.py <out.pdf>`.

- [ ] **Step 1: Siapkan virtualenv dan dependency**

`sidecar/requirements.txt`:
```
fastapi==0.143.0
uvicorn==0.54.0
pdfplumber==0.11.10
python-multipart==0.0.32
```
`sidecar/requirements-dev.txt`:
```
-r requirements.txt
pytest==9.1.1
reportlab==5.0.1
httpx==0.28.1
```
Run:
```bash
cd sidecar && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
```
Expected: instalasi sukses.

- [ ] **Step 2: Tulis generator PDF sintetis**

`sidecar/tests/conftest.py`:
```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
```

`sidecar/tests/make_fixture.py`:
```python
"""Generator PDF sintetis berformat eStatement BCA untuk test (tanpa data asli)."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

FONT = "Courier"
SIZE = 8
X_DATE, X_DESC, X_CBG, X_MUTASI, X_SALDO = 40, 90, 260, 330, 470
MUTASI_RIGHT, SALDO_RIGHT = 400, 555
LINE = 11


@dataclass
class Txn:
    day: int
    lines: list[str]               # baris keterangan; baris pertama sejajar tanggal
    amount: Decimal
    direction: str                 # "DB" | "CR"
    show_balance: bool = True


@dataclass
class Statement:
    account_no: str = "1234567890"
    month_name: str = "AGUSTUS"
    month: int = 8
    year: int = 2026
    opening: Decimal = Decimal("1000000.00")
    txns: list[Txn] = field(default_factory=list)
    rows_per_page: int = 40
    footer_override: dict | None = None  # untuk membuat checksum salah
    with_header: bool = True             # False → PDF "bukan BCA"


def money(d: Decimal) -> str:
    return f"{d:,.2f}"


def build_pdf(st: Statement) -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _, height = A4

    pages: list[list[Txn]] = [[]]
    used = 1  # baris SALDO AWAL di halaman pertama
    for t in st.txns:
        if used + len(t.lines) > st.rows_per_page:
            pages.append([])
            used = 0
        pages[-1].append(t)
        used += len(t.lines)

    running = st.opening
    cr_total = db_total = Decimal(0)
    cr_count = db_count = 0
    for page_no, page_txns in enumerate(pages, start=1):
        c.setFont(FONT, SIZE)
        y = height - 60
        if not st.with_header:
            c.drawString(40, y, "INVOICE PT CONTOH — BUKAN REKENING KORAN")
            c.showPage()
            continue
        c.drawString(200, y, "REKENING      GIRO")
        y -= LINE * 2
        c.drawString(40, y, "PT CONTOH SINTETIS")
        c.drawString(300, y, f"NO. REKENING : {st.account_no}")
        y -= LINE
        c.drawString(300, y, f"HALAMAN     :  {page_no} /{len(pages)}")
        y -= LINE
        c.drawString(300, y, f"PERIODE     :  {st.month_name} {st.year}")
        y -= LINE
        c.drawString(300, y, "MATA UANG   :  IDR")
        y -= LINE * 2
        for x, word in ((X_DATE, "TANGGAL"), (X_DESC, "KETERANGAN"), (X_CBG, "CBG"),
                        (X_MUTASI, "MUTASI"), (X_SALDO, "SALDO")):
            c.drawString(x, y, word)
        y -= LINE * 2
        if page_no == 1:
            c.drawString(X_DATE, y, f"01/{st.month:02d}")
            c.drawString(X_DESC, y, "SALDO AWAL")
            c.drawRightString(SALDO_RIGHT, y, money(st.opening))
            y -= LINE
        for t in page_txns:
            if t.direction == "CR":
                running += t.amount
                cr_total += t.amount
                cr_count += 1
            else:
                running -= t.amount
                db_total += t.amount
                db_count += 1
            c.drawString(X_DATE, y, f"{t.day:02d}/{st.month:02d}")
            c.drawString(X_DESC, y, t.lines[0])
            c.drawRightString(MUTASI_RIGHT, y, money(t.amount))
            if t.direction == "DB":
                c.drawString(MUTASI_RIGHT + 4, y, "DB")
            if t.show_balance:
                c.drawRightString(SALDO_RIGHT, y, money(running))
            y -= LINE
            for extra in t.lines[1:]:
                c.drawString(X_DESC, y, extra)
                y -= LINE
        if page_no == len(pages):
            f = {
                "opening": st.opening, "cr_total": cr_total, "cr_count": cr_count,
                "db_total": db_total, "db_count": db_count, "closing": running,
            }
            f.update(st.footer_override or {})
            y -= LINE * 2
            c.drawString(200, y, f"SALDO AWAL :   {money(f['opening'])}")
            c.drawString(200, y - LINE, f"MUTASI CR :   {money(f['cr_total'])} {f['cr_count']}")
            c.drawString(200, y - LINE * 2, f"MUTASI DB :   {money(f['db_total'])} {f['db_count']}")
            c.drawString(200, y - LINE * 3, f"SALDO AKHIR :  {money(f['closing'])}")
        c.showPage()
    c.save()
    return buf.getvalue()


def simple_statement() -> Statement:
    return Statement(txns=[
        Txn(2, ["BIAYA ADM"], Decimal("30000.00"), "DB"),
        Txn(5, ["TRSF E-BANKING CR 0508/FTSCY/WS12345", "2500000.00", "PELANGGAN SATU"],
            Decimal("2500000.00"), "CR", show_balance=False),
        Txn(5, ["BYR VIA E-BANKING", "PLN PASCABAYAR"], Decimal("450000.00"), "DB"),
        Txn(31, ["BUNGA"], Decimal("1234.56"), "CR", show_balance=False),
        Txn(31, ["PAJAK BUNGA"], Decimal("246.91"), "DB"),
    ])


if __name__ == "__main__":
    import sys

    with open(sys.argv[1], "wb") as fh:
        fh.write(build_pdf(simple_statement()))
```

- [ ] **Step 3: Tulis test parser (sintetis) yang gagal**

`sidecar/tests/test_parser_synthetic.py`:
```python
from datetime import date
from decimal import Decimal

import pytest

from bca_parser import ParseError, parse_bca
from make_fixture import Statement, Txn, build_pdf, simple_statement


def test_parses_simple_statement():
    st = parse_bca(build_pdf(simple_statement()))
    assert st.account_no == "1234567890"
    assert st.period_start == date(2026, 8, 1)
    assert st.period_end == date(2026, 8, 31)
    assert st.opening_balance == Decimal("1000000.00")
    assert st.closing_balance == Decimal("3020987.65")
    assert [t.direction for t in st.transactions] == ["DB", "CR", "DB", "CR", "DB"]
    assert [t.line_no for t in st.transactions] == [1, 2, 3, 4, 5]
    first = st.transactions[0]
    assert (first.date, first.description, first.amount, first.balance) == (
        date(2026, 8, 2), "BIAYA ADM", Decimal("30000.00"), Decimal("970000.00"))


def test_joins_multiline_description_and_allows_missing_balance():
    t = parse_bca(build_pdf(simple_statement())).transactions[1]
    assert t.description == "TRSF E-BANKING CR 0508/FTSCY/WS12345 2500000.00 PELANGGAN SATU"
    assert t.balance is None


def test_db_word_inside_description_does_not_flip_credit():
    st = Statement(txns=[Txn(3, ["TRSF E-BANKING DB 0308/FTSCY/WS1", "REFUND PEMASOK"],
                             Decimal("75000.00"), "CR")])
    t = parse_bca(build_pdf(st)).transactions[0]
    assert t.direction == "CR"
    assert "TRSF E-BANKING DB" in t.description


def test_multi_page_statement():
    st = Statement(rows_per_page=12, txns=[
        Txn(d % 28 + 1, ["TRANSFER KE VENDOR", "BARIS DUA"], Decimal("1000.00"), "DB")
        for d in range(20)
    ])
    parsed = parse_bca(build_pdf(st))
    assert len(parsed.transactions) == 20
    assert parsed.closing_balance == Decimal("980000.00")


def test_statement_without_transactions():
    parsed = parse_bca(build_pdf(Statement(txns=[])))
    assert parsed.transactions == []
    assert parsed.closing_balance == parsed.opening_balance


def test_checksum_mismatch_rejected():
    st = simple_statement()
    st.footer_override = {"cr_total": Decimal("1.00")}
    with pytest.raises(ParseError) as exc:
        parse_bca(build_pdf(st))
    assert exc.value.reason == "checksum_mismatch"


def test_count_mismatch_rejected():
    st = simple_statement()
    st.footer_override = {"db_count": 99}
    with pytest.raises(ParseError) as exc:
        parse_bca(build_pdf(st))
    assert exc.value.reason == "checksum_mismatch"


def test_non_bca_pdf_rejected():
    with pytest.raises(ParseError) as exc:
        parse_bca(build_pdf(Statement(with_header=False)))
    assert exc.value.reason == "not_bca"


def test_garbage_bytes_unreadable():
    with pytest.raises(ParseError) as exc:
        parse_bca(b"%PDF-1.4 bukan pdf sungguhan")
    assert exc.value.reason == "unreadable"


def test_to_dict_uses_decimal_strings():
    d = parse_bca(build_pdf(simple_statement())).to_dict()
    assert d["opening_balance"] == "1000000.00"
    assert d["transactions"][0] == {
        "line_no": 1, "date": "2026-08-02", "description": "BIAYA ADM",
        "amount": "30000.00", "direction": "DB", "balance": "970000.00",
    }
    assert d["transactions"][1]["balance"] is None
```

`sidecar/tests/test_parser_sample.py`:
```python
"""Test terhadap eStatement asli. File berada di sample/ (di-gitignore); di-skip bila tidak ada."""
from pathlib import Path

import pytest

from bca_parser import parse_bca

SAMPLE_DIR = Path(__file__).resolve().parents[2] / "sample"
SAMPLES = sorted(SAMPLE_DIR.glob("*.pdf")) if SAMPLE_DIR.exists() else []


@pytest.mark.skipif(not SAMPLES, reason="sample/*.pdf tidak tersedia")
@pytest.mark.parametrize("path", SAMPLES, ids=lambda p: p.name)
def test_real_sample_passes_checksum(path):
    st = parse_bca(path.read_bytes())  # checksum footer divalidasi di dalam parse_bca
    assert st.transactions, "statement asli harus punya transaksi"
    assert all(t.amount > 0 for t in st.transactions)
```

- [ ] **Step 4: Jalankan test, pastikan gagal**

Run: `cd sidecar && .venv/bin/pytest -q`
Expected: FAIL / error `ModuleNotFoundError: No module named 'bca_parser'`.

- [ ] **Step 5: Implementasi parser**

`sidecar/bca_parser.py`:
```python
"""Parser eStatement BCA (rekening giro/tabungan) berbasis posisi kata pdfplumber."""
from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from io import BytesIO

import pdfplumber

MONTHS = {
    "JANUARI": 1, "FEBRUARI": 2, "MARET": 3, "APRIL": 4, "MEI": 5, "JUNI": 6,
    "JULI": 7, "AGUSTUS": 8, "SEPTEMBER": 9, "OKTOBER": 10, "NOVEMBER": 11, "DESEMBER": 12,
}
AMOUNT_RE = re.compile(r"^(\d{1,3}(?:,\d{3})*\.\d{2})(DB)?$")
DATE_RE = re.compile(r"^(\d{2})/(\d{2})$")
FOOTER_ROW_RE = re.compile(r"^(SALDO AWAL|MUTASI CR|MUTASI DB|SALDO AKHIR)\s*:")
SKIP_ROW_RE = re.compile(r"^BERSAMBUNG", re.IGNORECASE)
HEADER_WORDS = ("TANGGAL", "KETERANGAN", "MUTASI", "SALDO")
ROW_TOLERANCE = 2.5


class ParseError(Exception):
    def __init__(self, reason: str, detail: str):
        super().__init__(f"{reason}: {detail}")
        self.reason = reason
        self.detail = detail


@dataclass
class BcaTransaction:
    line_no: int
    date: date
    description: str
    amount: Decimal
    direction: str  # "DB" | "CR"
    balance: Decimal | None


@dataclass
class BcaStatement:
    account_no: str
    period_start: date
    period_end: date
    opening_balance: Decimal
    closing_balance: Decimal
    transactions: list[BcaTransaction]

    def to_dict(self) -> dict:
        return {
            "account_no": self.account_no,
            "period_start": self.period_start.isoformat(),
            "period_end": self.period_end.isoformat(),
            "opening_balance": _fmt(self.opening_balance),
            "closing_balance": _fmt(self.closing_balance),
            "transactions": [
                {
                    "line_no": t.line_no,
                    "date": t.date.isoformat(),
                    "description": t.description,
                    "amount": _fmt(t.amount),
                    "direction": t.direction,
                    "balance": _fmt(t.balance) if t.balance is not None else None,
                }
                for t in self.transactions
            ],
        }


@dataclass
class _Row:
    date_token: str | None
    text: str
    amount: Decimal | None
    is_db: bool
    saldo: Decimal | None


def _fmt(d: Decimal) -> str:
    return f"{d:.2f}"


def _dec(s: str) -> Decimal:
    return Decimal(s.replace(",", ""))


def parse_bca(pdf_bytes: bytes) -> BcaStatement:
    try:
        pdf = pdfplumber.open(BytesIO(pdf_bytes))
        pages = pdf.pages
    except Exception as exc:  # pdfminer melempar berbagai jenis error
        raise ParseError("unreadable", str(exc)) from exc
    with pdf:
        if not pages:
            raise ParseError("unreadable", "PDF tidak memiliki halaman")
        try:
            first_text = pages[0].extract_text() or ""
        except Exception as exc:
            raise ParseError("unreadable", str(exc)) from exc
        account_no, year, month = _parse_header(first_text)
        rows: list[_Row] = []
        found_table = False
        for page in pages:
            page_rows = _table_rows(page)
            if page_rows is not None:
                found_table = True
                rows.extend(page_rows)
        footer = _parse_footer(pages[-1].extract_text() or "")
    if not found_table:
        raise ParseError("not_bca", "Tabel mutasi tidak ditemukan")

    opening_row: Decimal | None = None
    txns: list[BcaTransaction] = []
    for row in rows:
        if row.date_token:
            if row.text.upper().startswith("SALDO AWAL"):
                opening_row = row.saldo
                continue
            if row.amount is None:
                raise ParseError("unreadable", f"Baris tanpa nominal: {row.text}")
            day, mon = (int(x) for x in DATE_RE.match(row.date_token).groups())
            txns.append(BcaTransaction(
                line_no=len(txns) + 1,
                date=date(year, mon, day),
                description=row.text,
                amount=row.amount,
                direction="DB" if row.is_db else "CR",
                balance=row.saldo,
            ))
        elif txns and row.text:
            txns[-1].description = f"{txns[-1].description} {row.text}"

    statement = BcaStatement(
        account_no=account_no,
        period_start=date(year, month, 1),
        period_end=date(year, month, calendar.monthrange(year, month)[1]),
        opening_balance=footer["opening"],
        closing_balance=footer["closing"],
        transactions=txns,
    )
    _validate(statement, footer, opening_row)
    return statement


def _parse_header(text: str) -> tuple[str, int, int]:
    acc = re.search(r"NO\.\s*REKENING\s*:\s*(\d+)", text)
    per = re.search(r"PERIODE\s*:\s*([A-Z]+)\s+(\d{4})", text)
    if not acc or not per or per.group(1) not in MONTHS:
        raise ParseError("not_bca", "Header NO. REKENING / PERIODE tidak ditemukan")
    return acc.group(1), int(per.group(2)), MONTHS[per.group(1)]


def _parse_footer(text: str) -> dict:
    def grab(pattern: str) -> re.Match:
        m = re.search(pattern, text)
        if not m:
            raise ParseError("not_bca", f"Ringkasan footer tidak lengkap ({pattern})")
        return m

    num = r"([\d,]+\.\d{2})"
    cr = grab(rf"MUTASI CR\s*:\s*{num}\s+(\d+)")
    db = grab(rf"MUTASI DB\s*:\s*{num}\s+(\d+)")
    return {
        "opening": _dec(grab(rf"SALDO AWAL\s*:\s*{num}").group(1)),
        "cr_total": _dec(cr.group(1)), "cr_count": int(cr.group(2)),
        "db_total": _dec(db.group(1)), "db_count": int(db.group(2)),
        "closing": _dec(grab(rf"SALDO AKHIR\s*:\s*{num}").group(1)),
    }


def _group_lines(words: list[dict]) -> list[list[dict]]:
    lines: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(w["top"] - lines[-1][0]["top"]) <= ROW_TOLERANCE:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(line, key=lambda w: w["x0"]) for line in lines]


def _table_rows(page) -> list[_Row] | None:
    lines = _group_lines(page.extract_words())
    header_idx = None
    cols: dict[str, dict] = {}
    for i, line in enumerate(lines):
        texts = {w["text"]: w for w in line}
        if all(h in texts for h in HEADER_WORDS):
            header_idx, cols = i, texts
            break
    if header_idx is None:
        return None

    # Nominal rata kanan: mutasi berakhir di kiri titik tengah antara tepi kanan
    # header MUTASI dan SALDO; saldo berakhir di kanannya.
    mutasi_x0 = cols["MUTASI"]["x0"]
    saldo_split = (cols["MUTASI"]["x1"] + cols["SALDO"]["x1"]) / 2
    rows: list[_Row] = []
    for line in lines[header_idx + 1:]:
        line_text = " ".join(w["text"] for w in line)
        if FOOTER_ROW_RE.match(line_text):
            break
        if SKIP_ROW_RE.match(line_text):
            continue
        date_token = None
        desc: list[str] = []
        amount = saldo = None
        is_db = False
        for idx, w in enumerate(line):
            t = w["text"]
            m = AMOUNT_RE.match(t)
            if idx == 0 and DATE_RE.match(t):
                date_token = t
            elif m and w["x1"] > mutasi_x0:
                if w["x1"] > saldo_split:
                    saldo = _dec(m.group(1))
                else:
                    amount = _dec(m.group(1))
                    is_db = is_db or m.group(2) == "DB"
            elif t == "DB" and w["x0"] > mutasi_x0:
                is_db = True
            else:
                desc.append(t)
        rows.append(_Row(date_token, " ".join(desc), amount, is_db, saldo))
    return rows


def _validate(st: BcaStatement, footer: dict, opening_row: Decimal | None) -> None:
    def fail(detail: str) -> None:
        raise ParseError("checksum_mismatch", detail)

    if opening_row is not None and opening_row != footer["opening"]:
        fail(f"Saldo awal baris {opening_row} != footer {footer['opening']}")
    cr = [t.amount for t in st.transactions if t.direction == "CR"]
    db = [t.amount for t in st.transactions if t.direction == "DB"]
    if len(cr) != footer["cr_count"] or sum(cr, Decimal(0)) != footer["cr_total"]:
        fail(f"Mutasi CR {len(cr)}/{sum(cr, Decimal(0))} != footer {footer['cr_count']}/{footer['cr_total']}")
    if len(db) != footer["db_count"] or sum(db, Decimal(0)) != footer["db_total"]:
        fail(f"Mutasi DB {len(db)}/{sum(db, Decimal(0))} != footer {footer['db_count']}/{footer['db_total']}")
    running = footer["opening"]
    for t in st.transactions:
        running += t.amount if t.direction == "CR" else -t.amount
        if t.balance is not None and t.balance != running:
            fail(f"Saldo baris {t.line_no} {t.balance} != saldo berjalan {running}")
    if running != footer["closing"]:
        fail(f"Saldo akhir {running} != footer {footer['closing']}")
```

- [ ] **Step 6: Jalankan test, pastikan lolos**

Run: `cd sidecar && .venv/bin/pytest -q`
Expected: semua test sintetis PASS; `test_real_sample_passes_checksum[08.pdf]` PASS bila `sample/08.pdf` ada (parser ini sudah diprototipe terhadap file tersebut dan lolos checksum), atau SKIPPED bila tidak ada.
Jika `test_garbage_bytes_unreadable` gagal karena pdfplumber melempar error di titik lain, bungkus pemanggilan yang melempar dengan `try/except Exception → ParseError("unreadable", ...)` di `parse_bca`.

- [ ] **Step 7: Commit**

```bash
git add sidecar/requirements.txt sidecar/requirements-dev.txt sidecar/bca_parser.py sidecar/tests
git commit -m "feat(sidecar): BCA eStatement parser with footer checksum validation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Sidecar — FastAPI `/parse` + Dockerfile

**Files:**
- Create: `sidecar/main.py`, `sidecar/Dockerfile`, `sidecar/.dockerignore`
- Test: `sidecar/tests/test_api.py`

**Interfaces:**
- Consumes: `parse_bca`, `ParseError` (Task 1).
- Produces: HTTP `POST /parse` (multipart field `file`) → `200` JSON spec §5 | `422 {"reason","detail"}`; `GET /health` → `{"status":"ok"}`. Port 8000.

- [ ] **Step 1: Tulis test API yang gagal**

`sidecar/tests/test_api.py`:
```python
from fastapi.testclient import TestClient

from main import app
from make_fixture import Statement, build_pdf, simple_statement

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_parse_ok():
    res = client.post("/parse", files={"file": ("st.pdf", build_pdf(simple_statement()), "application/pdf")})
    assert res.status_code == 200
    body = res.json()
    assert body["account_no"] == "1234567890"
    assert len(body["transactions"]) == 5


def test_parse_rejects_non_pdf():
    res = client.post("/parse", files={"file": ("x.pdf", b"hello", "application/pdf")})
    assert res.status_code == 422
    assert res.json()["reason"] == "unreadable"


def test_parse_rejects_non_bca():
    pdf = build_pdf(Statement(with_header=False))
    res = client.post("/parse", files={"file": ("x.pdf", pdf, "application/pdf")})
    assert res.status_code == 422
    assert res.json()["reason"] == "not_bca"
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `cd sidecar && .venv/bin/pytest tests/test_api.py -q`
Expected: FAIL `ModuleNotFoundError: No module named 'main'`.

- [ ] **Step 3: Implementasi**

`sidecar/main.py`:
```python
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from bca_parser import ParseError, parse_bca

app = FastAPI(title="jurnalku-sidecar")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/parse")
async def parse(file: UploadFile = File(...)):
    data = await file.read()  # tetap di memori; tidak pernah ditulis ke disk
    if not data.startswith(b"%PDF"):
        return JSONResponse(status_code=422, content={"reason": "unreadable", "detail": "Bukan file PDF"})
    try:
        statement = parse_bca(data)
    except ParseError as exc:
        return JSONResponse(status_code=422, content={"reason": exc.reason, "detail": exc.detail})
    return statement.to_dict()
```

`sidecar/Dockerfile`:
```dockerfile
FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY bca_parser.py main.py ./
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`sidecar/.dockerignore`:
```
.venv
tests
__pycache__
.pytest_cache
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd sidecar && .venv/bin/pytest -q`
Expected: semua PASS (sample: PASS/SKIPPED).

- [ ] **Step 5: Verifikasi image Docker bisa dibangun**

Run: `docker build -t jurnalku-sidecar sidecar && docker run --rm -d -p 18000:8000 --name jk-sc jurnalku-sidecar && sleep 3 && curl -s localhost:18000/health; docker stop jk-sc`
Expected: `{"status":"ok"}`.

- [ ] **Step 6: Commit**

```bash
git add sidecar/main.py sidecar/Dockerfile sidecar/.dockerignore sidecar/tests/test_api.py
git commit -m "feat(sidecar): FastAPI /parse and /health endpoints with Dockerfile

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: App scaffold — SvelteKit + Bun + Tailwind + shadcn-svelte + money helper

**Files:**
- Create: `app/package.json`, `app/bunfig.toml`, `app/svelte.config.js`, `app/vite.config.ts`, `app/tsconfig.json`, `app/src/app.html`, `app/src/app.css`, `app/src/app.d.ts`, `app/src/routes/+layout.svelte`, `app/src/routes/+page.server.ts`
- Create: `app/src/lib/money.ts`
- Create (generated): `app/components.json`, `app/src/lib/utils.ts`, `app/src/lib/components/ui/**`
- Test: `app/tests/unit/money.test.ts`

**Interfaces:**
- Produces: `D(v: Decimal.Value): Decimal`, `sumMoney(values: Decimal.Value[]): Decimal`, `toMoney(v: Decimal.Value): string` (2 desimal, `"1234.50"`), `formatIdr(v: Decimal.Value | null | undefined): string` (`"1.234,50"`, negatif `"-1.234,50"`, null → `""`), `isZero(v): boolean` — semuanya dari `app/src/lib/money.ts` (dipakai client & server).
- Produces: komponen shadcn di `$lib/components/ui/{button,input,label,card,badge,table,dialog,alert}`.

- [ ] **Step 1: Buat file konfigurasi**

`app/package.json`:
```json
{
  "name": "jurnalku-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun --bun vite dev",
    "build": "bun --bun vite build",
    "preview": "bun ./build/index.js",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test": "svelte-kit sync && bun test tests/unit tests/integration",
    "test:unit": "svelte-kit sync && bun test tests/unit",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun run src/lib/server/db/migrate.ts",
    "db:seed": "bun run seeds/index.ts"
  },
  "dependencies": {
    "better-auth": "1.7.6",
    "decimal.js": "10.6.0",
    "drizzle-orm": "0.45.3",
    "postgres": "3.4.9",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@playwright/test": "1.63.0",
    "@sveltejs/kit": "2.70.3",
    "@sveltejs/vite-plugin-svelte": "6.2.4",
    "@tailwindcss/vite": "4.3.3",
    "@types/bun": "1.4.2",
    "drizzle-kit": "0.31.11",
    "svelte": "5.57.1",
    "svelte-adapter-bun": "1.0.1",
    "svelte-check": "4.7.6",
    "tailwindcss": "4.3.3",
    "typescript": "5.9.3",
    "vite": "7.3.6"
  }
}
```

`app/bunfig.toml`:
```toml
[test]
preload = ["./tests/setup.ts"]
```

`app/svelte.config.js`:
```js
import adapter from 'svelte-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: { adapter: adapter() }
};
```

`app/vite.config.ts`:
```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [tailwindcss(), sveltekit()] });
```

`app/tsconfig.json`:
```json
{
	"extends": "./.svelte-kit/tsconfig.json",
	"compilerOptions": {
		"allowJs": true,
		"checkJs": true,
		"esModuleInterop": true,
		"forceConsistentCasingInFileNames": true,
		"resolveJsonModule": true,
		"skipLibCheck": true,
		"sourceMap": true,
		"strict": true,
		"moduleResolution": "bundler",
		"types": ["bun"]
	}
}
```

`app/src/app.html`:
```html
<!doctype html>
<html lang="id">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Jurnalku</title>
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

`app/src/app.css`:
```css
@import 'tailwindcss';
```

`app/src/app.d.ts` (sementara; diperluas di Task 6):
```ts
declare global {
	namespace App {}
}
export {};
```

`app/src/routes/+layout.svelte`:
```svelte
<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

{@render children()}
```

`app/src/routes/+page.server.ts`:
```ts
import { redirect } from '@sveltejs/kit';

export const load = () => {
	redirect(303, '/dashboard');
};
```

`app/tests/setup.ts` (sementara; diperluas di Task 4):
```ts
process.env.TZ = 'UTC';
```

- [ ] **Step 2: Install dependency dan sync**

Run: `cd app && bun install && bunx svelte-kit sync`
Expected: `bun.lock` terbentuk, `.svelte-kit/tsconfig.json` ada.

- [ ] **Step 3: Inisialisasi shadcn-svelte dan tambahkan komponen**

CLI 1.7.0 selalu menanyakan *preset* design system secara interaktif; tekan Enter untuk menerima default (preset **Vega**, ikon lucide). Opsi lain diberikan lewat flag:

```bash
cd app
FLAGS="--base-color neutral --css src/app.css --components-alias \$lib/components --lib-alias \$lib --utils-alias \$lib/utils --hooks-alias \$lib/hooks --ui-alias \$lib/components/ui"
# Terminal interaktif: jalankan lalu tekan Enter di setiap prompt
bunx shadcn-svelte@1.7.0 init $FLAGS
# Tanpa TTY (agent/CI) — macOS; di Linux ganti `script -q /dev/null CMD` dengan `script -qc "CMD" /dev/null`
(for i in $(seq 1 12); do sleep 4; printf '\r'; done) | script -q /dev/null bunx shadcn-svelte@1.7.0 init $FLAGS
```
Expected: `Success! Project initialization completed.`, file `components.json` berisi `"style": "vega"`.

Run: `cd app && bunx shadcn-svelte@1.7.0 add button input label card badge table dialog alert --yes`
Expected: folder `src/lib/components/ui/{button,input,label,card,badge,table,dialog,alert}` ada, `src/lib/utils.ts` ada, `components.json` ada, dan `app.css` berisi token tema shadcn. Jika CLI menambah dependency ke `package.json` dengan `^`, ubah menjadi versi persis yang terinstal (`bun pm ls`).

> **Penting:** dependency yang ditambahkan CLI (`bits-ui`, `@lucide/svelte`, `cn`, `tailwind-variants`, `tw-animate-css`, `clsx`, `@internationalized/date`, dst.; `src/lib/utils.ts` hasil generate mengimpor `cn` dari paket npm `cn`) **wajib tetap tercantum** di `package.json`. Jangan menimpa `package.json` dengan isi dari Step 1 setelah langkah ini. Tanpa entri itu, Vite tidak mem-bundle library Svelte tersebut untuk SSR, dan `bun run build` gagal (error parse `*.svelte` di `node_modules`, atau `failed to resolve import "cn"` di build Docker).

- [ ] **Step 4: Tulis test money yang gagal**

`app/tests/unit/money.test.ts`:
```ts
import { describe, expect, test } from 'bun:test';
import { D, formatIdr, isZero, sumMoney, toMoney } from '$lib/money';

describe('money', () => {
	test('sumMoney adds without float error', () => {
		expect(toMoney(sumMoney(['0.10', '0.20']))).toBe('0.30');
		expect(toMoney(sumMoney([]))).toBe('0.00');
	});
	test('toMoney rounds to 2 decimals', () => {
		expect(toMoney('1234.5')).toBe('1234.50');
		expect(toMoney(D('10').div(3))).toBe('3.33');
	});
	test('formatIdr uses id-ID separators', () => {
		expect(formatIdr('1234567.89')).toBe('1.234.567,89');
		expect(formatIdr('0')).toBe('0,00');
		expect(formatIdr('-30000')).toBe('-30.000,00');
		expect(formatIdr(null)).toBe('');
	});
	test('isZero', () => {
		expect(isZero('0.00')).toBe(true);
		expect(isZero('0.01')).toBe(false);
	});
});
```

- [ ] **Step 5: Jalankan, pastikan gagal**

Run: `cd app && bun run test:unit`
Expected: FAIL — `Cannot find module '$lib/money'`.

- [ ] **Step 6: Implementasi**

`app/src/lib/money.ts`:
```ts
import Decimal from 'decimal.js';

export type MoneyValue = Decimal.Value;

export function D(v: MoneyValue): Decimal {
	return new Decimal(v);
}

export function sumMoney(values: MoneyValue[]): Decimal {
	return values.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0));
}

export function toMoney(v: MoneyValue): string {
	return new Decimal(v).toFixed(2, Decimal.ROUND_HALF_UP);
}

export function isZero(v: MoneyValue): boolean {
	return new Decimal(v).isZero();
}

export function formatIdr(v: MoneyValue | null | undefined): string {
	if (v === null || v === undefined || v === '') return '';
	const fixed = new Decimal(v).toFixed(2, Decimal.ROUND_HALF_UP);
	const negative = fixed.startsWith('-');
	const [int, frac] = (negative ? fixed.slice(1) : fixed).split('.');
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return `${negative ? '-' : ''}${grouped},${frac}`;
}
```

- [ ] **Step 7: Jalankan test dan build**

Run: `cd app && bun run test:unit && bun run build`
Expected: test PASS; build sukses (folder `build/` terbentuk).

- [ ] **Step 8: Commit**

```bash
git add app/package.json app/bun.lock app/bunfig.toml app/svelte.config.js app/vite.config.ts app/tsconfig.json app/components.json app/src app/tests
git commit -m "feat(app): scaffold SvelteKit + Bun + Tailwind + shadcn-svelte with money helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Database schema, migrasi, Postgres dev, dan helper test

**Files:**
- Create: `docker-compose.yml` (sementara: hanya `db`), `docker/db-init/01-test-db.sql`
- Create: `app/.env.example`, `app/drizzle.config.ts`
- Create: `app/src/lib/server/env.ts`, `app/src/lib/server/db/schema.ts`, `app/src/lib/server/db/index.ts`, `app/src/lib/server/db/migrate.ts`, `app/src/lib/server/db/errors.ts`
- Create (generated): `app/drizzle/migrations/*`
- Modify: `app/tests/setup.ts`
- Create: `app/tests/integration/db.ts`
- Test: `app/tests/integration/schema.test.ts`

**Interfaces:**
- Produces: `env` (getter `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SIDECAR_URL`, `OLLAMA_URL`, `OLLAMA_MODEL`), `assertRuntimeEnv(): void`.
- Produces: `db`, `client`, type `DB`, `Tx`, `Executor = DB | Tx` dari `src/lib/server/db/index.ts`.
- Produces: tabel Drizzle `user`, `session`, `authAccount` (tabel SQL `account`), `verification`, `companies`, `userCompanies`, `accounts`, `categoryRules`, `statementUploads`, `transactions`, `journalEntries`, `journalLines`; enum `userRole`, `accountType`, `normalBalance`, `cashFlowCategory`, `ruleSource`, `txDirection`, `uploadStatus`, `txSource`, `journalType`.
- Produces: `isUniqueViolation(e: unknown): boolean`.
- Produces (test): `resetDb(): Promise<void>` — migrasi sekali lalu TRUNCATE semua tabel.

- [ ] **Step 1: Postgres dev via Docker Compose**

`docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: jurnalku
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-jurnalku}
      POSTGRES_DB: jurnalku
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/db-init:/docker-entrypoint-initdb.d:ro
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jurnalku"]
      interval: 5s
      retries: 10

volumes:
  pgdata:
```

`docker/db-init/01-test-db.sql`:
```sql
CREATE DATABASE jurnalku_test OWNER jurnalku;
```

Run: `docker compose up -d db && docker compose exec db psql -U jurnalku -lqt | cut -d'|' -f1`
Expected: daftar database berisi `jurnalku` dan `jurnalku_test`. (Jika volume sudah ada dari sebelumnya, init script tidak jalan; buat manual: `docker compose exec db createdb -U jurnalku jurnalku_test`.)

`app/.env.example`:
```
DATABASE_URL=postgres://jurnalku:jurnalku@localhost:5432/jurnalku
BETTER_AUTH_SECRET=ganti-dengan-string-acak-minimal-32-karakter
BETTER_AUTH_URL=http://localhost:5173
SIDECAR_URL=http://localhost:8000
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
SEED_ADMIN_EMAIL=admin@jurnalku.local
SEED_ADMIN_PASSWORD=ganti-password-ini
```
Run: `cp app/.env.example app/.env` lalu isi `BETTER_AUTH_SECRET` dengan `openssl rand -hex 32` dan `SEED_ADMIN_PASSWORD` dengan password ≥ 8 karakter. (`app/.env` di-gitignore.)

- [ ] **Step 2: env, schema, client DB**

`app/src/lib/server/env.ts`:
```ts
function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Environment variable ${name} wajib diisi`);
	return value;
}

export const env = {
	get DATABASE_URL() {
		return required('DATABASE_URL');
	},
	get BETTER_AUTH_SECRET() {
		return required('BETTER_AUTH_SECRET');
	},
	get BETTER_AUTH_URL() {
		return process.env.BETTER_AUTH_URL ?? 'http://localhost:5173';
	},
	get SIDECAR_URL() {
		return process.env.SIDECAR_URL ?? 'http://localhost:8000';
	},
	get OLLAMA_URL() {
		return process.env.OLLAMA_URL ?? 'http://localhost:11434';
	},
	get OLLAMA_MODEL() {
		return process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
	}
};

/** Dipanggil saat server start agar env wajib yang kosong gagal cepat dengan pesan jelas. */
export function assertRuntimeEnv(): void {
	void env.DATABASE_URL;
	void env.BETTER_AUTH_SECRET;
}
```

`app/src/lib/server/db/schema.ts`:
```ts
import { sql } from 'drizzle-orm';
import {
	type AnyPgColumn,
	boolean,
	check,
	date,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
	varchar
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 18, scale: 2 });
const day = (name: string) => date(name, { mode: 'string' });

export const userRole = pgEnum('user_role', ['admin', 'accountant', 'viewer']);
export const accountType = pgEnum('account_type', ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']);
export const normalBalance = pgEnum('normal_balance', ['DEBIT', 'CREDIT']);
export const cashFlowCategory = pgEnum('cash_flow_category', ['OPERATING', 'INVESTING', 'FINANCING']);
export const ruleSource = pgEnum('rule_source', ['SYSTEM', 'USER']);
export const txDirection = pgEnum('tx_direction', ['DB', 'CR']);
export const uploadStatus = pgEnum('upload_status', ['processing', 'review', 'done', 'error']);
export const txSource = pgEnum('tx_source', ['RULE', 'AI', 'USER']);
export const journalType = pgEnum('journal_type', ['OPENING', 'TRANSACTION']);

// ── Better Auth ───────────────────────────────────────────────
export const user = pgTable('user', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	isSuperAdmin: boolean('is_super_admin').notNull().default(false),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

export const session = pgTable('session', {
	id: uuid('id').primaryKey().defaultRandom(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	token: text('token').notNull().unique(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: uuid('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

export const authAccount = pgTable('account', {
	id: uuid('id').primaryKey().defaultRandom(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: uuid('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
	scope: text('scope'),
	password: text('password'),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

export const verification = pgTable('verification', {
	id: uuid('id').primaryKey().defaultRandom(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

// ── Multi-company ─────────────────────────────────────────────
export const companies = pgTable('companies', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	npwp: varchar('npwp', { length: 20 }),
	address: text('address'),
	fiscalYear: varchar('fiscal_year', { length: 10 }).notNull().default('JANUARY'),
	currency: varchar('currency', { length: 5 }).notNull().default('IDR'),
	bankAccountId: uuid('bank_account_id').references((): AnyPgColumn => accounts.id, {
		onDelete: 'set null'
	}),
	createdAt: createdAt()
});

export const userCompanies = pgTable(
	'user_companies',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		role: userRole('role').notNull()
	},
	(t) => [unique('user_companies_user_company_uq').on(t.userId, t.companyId)]
);

// ── Chart of Accounts ─────────────────────────────────────────
export const accounts = pgTable(
	'accounts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		code: varchar('code', { length: 20 }).notNull(),
		name: text('name').notNull(),
		type: accountType('type').notNull(),
		normalBal: normalBalance('normal_bal').notNull(),
		parentId: uuid('parent_id').references((): AnyPgColumn => accounts.id),
		cashFlowCat: cashFlowCategory('cash_flow_cat'),
		isActive: boolean('is_active').notNull().default(true)
	},
	(t) => [unique('accounts_company_code_uq').on(t.companyId, t.code), index('accounts_parent_idx').on(t.parentId)]
);

// ── Category rules ────────────────────────────────────────────
export const categoryRules = pgTable(
	'category_rules',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		keywordPattern: text('keyword_pattern').notNull(),
		accountId: uuid('account_id')
			.notNull()
			.references(() => accounts.id),
		direction: txDirection('direction'),
		priority: integer('priority').notNull().default(0),
		source: ruleSource('source').notNull().default('SYSTEM'),
		createdAt: createdAt()
	},
	(t) => [
		unique('category_rules_company_keyword_direction_uq')
			.on(t.companyId, t.keywordPattern, t.direction)
			.nullsNotDistinct()
	]
);

// ── Statement & transactions ──────────────────────────────────
export const statementUploads = pgTable(
	'statement_uploads',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		uploadedBy: uuid('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
		filename: text('filename').notNull(),
		bank: varchar('bank', { length: 20 }).notNull().default('BCA'),
		accountNo: varchar('account_no', { length: 30 }).notNull(),
		periodStart: day('period_start').notNull(),
		periodEnd: day('period_end').notNull(),
		openingBalance: money('opening_balance').notNull(),
		closingBalance: money('closing_balance').notNull(),
		status: uploadStatus('status').notNull().default('processing'),
		balanceWarning: text('balance_warning'),
		errorMessage: text('error_message'),
		aiStatus: text('ai_status'),
		uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('statement_uploads_company_account_idx').on(t.companyId, t.accountNo)]
);

export const transactions = pgTable(
	'transactions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		uploadId: uuid('upload_id')
			.notNull()
			.references(() => statementUploads.id, { onDelete: 'cascade' }),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		lineNo: integer('line_no').notNull(),
		txnDate: day('txn_date').notNull(),
		description: text('description').notNull(),
		groupKey: text('group_key').notNull(),
		debit: money('debit').notNull().default('0'),
		credit: money('credit').notNull().default('0'),
		balance: money('balance'),
		accountId: uuid('account_id').references(() => accounts.id),
		isConfirmed: boolean('is_confirmed').notNull().default(false),
		aiConfidence: numeric('ai_confidence', { precision: 4, scale: 3 }),
		source: txSource('source'),
		aiSuggestedAccountId: uuid('ai_suggested_account_id').references(() => accounts.id),
		aiReason: text('ai_reason'),
		aiKeyword: text('ai_keyword'),
		confirmedBy: uuid('confirmed_by').references(() => user.id, { onDelete: 'set null' }),
		confirmedAt: timestamp('confirmed_at', { withTimezone: true })
	},
	(t) => [
		index('transactions_company_pending_idx').on(t.companyId, t.isConfirmed),
		index('transactions_upload_idx').on(t.uploadId, t.lineNo)
	]
);

// ── Journal ───────────────────────────────────────────────────
export const journalEntries = pgTable(
	'journal_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		type: journalType('type').notNull(),
		uploadId: uuid('upload_id').references(() => statementUploads.id, { onDelete: 'cascade' }),
		transactionId: uuid('transaction_id')
			.unique()
			.references(() => transactions.id, { onDelete: 'cascade' }),
		entryDate: day('entry_date').notNull(),
		description: text('description'),
		refNo: varchar('ref_no', { length: 50 }),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('journal_entries_company_date_idx').on(t.companyId, t.entryDate)]
);

export const journalLines = pgTable(
	'journal_lines',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		journalId: uuid('journal_id')
			.notNull()
			.references(() => journalEntries.id, { onDelete: 'cascade' }),
		accountId: uuid('account_id')
			.notNull()
			.references(() => accounts.id),
		debit: money('debit').notNull().default('0'),
		credit: money('credit').notNull().default('0')
	},
	(t) => [
		index('journal_lines_account_idx').on(t.accountId),
		check(
			'journal_lines_one_side',
			sql`${t.debit} >= 0 AND ${t.credit} >= 0 AND ((${t.debit} = 0) <> (${t.credit} = 0))`
		)
	]
);
```

`app/src/lib/server/db/index.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// `vite build` memuat modul server tanpa env runtime. postgres.js baru membuka koneksi saat query
// pertama, jadi placeholder aman saat build; env asli divalidasi saat server start (assertRuntimeEnv).
const url = process.env.DATABASE_URL ?? 'postgres://unset:unset@127.0.0.1:1/unset';

export const client = postgres(url, { max: 10 });
export const db = drizzle(client, { schema });

export type DB = typeof db;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type Executor = DB | Tx;
```

`app/src/lib/server/db/migrate.ts`:
```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { client, db } from './index';

await migrate(db, { migrationsFolder: new URL('../../../../drizzle/migrations', import.meta.url).pathname });
await client.end();
console.log('Migrasi database selesai');
```

`app/src/lib/server/db/errors.ts`:
```ts
/** True bila error (atau cause-nya, karena Drizzle membungkus error driver) adalah unique violation Postgres. */
export function isUniqueViolation(e: unknown): boolean {
	let cur: unknown = e;
	for (let depth = 0; cur && depth < 5; depth++) {
		if (typeof cur === 'object' && 'code' in cur && (cur as { code: unknown }).code === '23505') return true;
		cur = typeof cur === 'object' && 'cause' in cur ? (cur as { cause: unknown }).cause : null;
	}
	return false;
}
```

`app/drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle/migrations',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://jurnalku:jurnalku@localhost:5432/jurnalku' }
});
```

- [ ] **Step 3: Generate migrasi dan terapkan ke DB dev**

Run: `cd app && bun run db:generate && bun run db:migrate`
Expected: file `drizzle/migrations/0000_*.sql` terbentuk; output `Migrasi database selesai`.

- [ ] **Step 4: Helper test DB**

`app/tests/setup.ts` (ganti seluruh isi):
```ts
process.env.TZ = 'UTC';
// Selalu pakai DB test, jangan pernah DB dev (Bun sudah memuat app/.env sebelum preload ini).
process.env.DATABASE_URL =
	process.env.TEST_DATABASE_URL ?? 'postgres://jurnalku:jurnalku@localhost:5432/jurnalku_test';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789-test-secret-0123456789';
process.env.BETTER_AUTH_URL ??= 'http://localhost:5173';
```

`app/tests/integration/db.ts`:
```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { client, db } from '../../src/lib/server/db';

let migrated: Promise<void> | null = null;

export async function resetDb(): Promise<void> {
	migrated ??= migrate(db, { migrationsFolder: './drizzle/migrations' });
	await migrated;
	await client.unsafe(
		`TRUNCATE TABLE journal_lines, journal_entries, transactions, statement_uploads, category_rules,
		 user_companies, companies, accounts, "session", "account", "verification", "user"
		 RESTART IDENTITY CASCADE`
	);
}
```

- [ ] **Step 5: Tulis test schema**

`app/tests/integration/schema.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { db } from '../../src/lib/server/db';
import { isUniqueViolation } from '../../src/lib/server/db/errors';
import { accounts, companies, journalEntries, journalLines } from '../../src/lib/server/db/schema';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const [c] = await db.insert(companies).values({ name: 'PT Uji' }).returning();
	const [a] = await db
		.insert(accounts)
		.values({ companyId: c.id, code: '1-1002', name: 'Bank', type: 'ASSET', normalBal: 'DEBIT' })
		.returning();
	const [e] = await db
		.insert(journalEntries)
		.values({ companyId: c.id, type: 'OPENING', entryDate: '2026-08-01' })
		.returning();
	return { c, a, e };
}

test('numeric round-trips as exact string', async () => {
	const { a, e } = await setup();
	await db.insert(journalLines).values({ journalId: e.id, accountId: a.id, debit: '1234567.89' });
	const [line] = await db.select().from(journalLines);
	expect(line.debit).toBe('1234567.89');
	expect(line.credit).toBe('0.00');
});

test('journal line must have exactly one non-zero side', async () => {
	const { a, e } = await setup();
	// Query builder Drizzle hanya "thenable"; bungkus dengan Promise.resolve agar bisa dipakai .rejects
	await expect(Promise.resolve(db.insert(journalLines).values({ journalId: e.id, accountId: a.id, debit: '1', credit: '1' }))).rejects.toThrow();
	await expect(Promise.resolve(db.insert(journalLines).values({ journalId: e.id, accountId: a.id }))).rejects.toThrow();
});

test('account code unique per company', async () => {
	const { c } = await setup();
	try {
		await db.insert(accounts).values({ companyId: c.id, code: '1-1002', name: 'Dup', type: 'ASSET', normalBal: 'DEBIT' });
		throw new Error('should fail');
	} catch (err) {
		expect(isUniqueViolation(err)).toBe(true);
	}
});
```

- [ ] **Step 6: Jalankan test**

Run: `cd app && bun test tests/integration/schema.test.ts`
Expected: 3 PASS.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml docker app/.env.example app/drizzle.config.ts app/drizzle app/src/lib/server app/tests
git commit -m "feat(app): drizzle schema, migrations, dev postgres and test db helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Seed perusahaan (CoA + rules), pembuatan user, dan `db:seed`

**Files:**
- Create: `app/src/lib/server/password.ts`, `app/src/lib/server/users/create.ts`
- Create: `app/src/lib/server/company/coa-data.ts`, `app/src/lib/server/company/rules-data.ts`, `app/src/lib/server/company/seed-company.ts`
- Create: `app/seeds/index.ts`
- Create: `app/tests/integration/factory.ts`
- Test: `app/tests/unit/seed-data.test.ts`, `app/tests/integration/seed.test.ts`

**Interfaces:**
- Consumes: `db`, `Executor`, schema (Task 4).
- Produces: `hashPassword(pw): Promise<string>`, `verifyPassword(pw, hash): Promise<boolean>` (argon2id via `Bun.password`).
- Produces: `createUserWithPassword(ex: Executor, input: { email: string; name: string; password: string; isSuperAdmin?: boolean }): Promise<{ id: string; email: string; name: string; isSuperAdmin: boolean }>`; `findUserByEmail(ex, email): Promise<{ id; email; name; isSuperAdmin; isActive } | null>`.
- Produces: `DEFAULT_COA: CoaSeed[]` (76 akun), `BANK_ACCOUNT_CODE = '1-1002'`, `DEFAULT_RULES: RuleSeed[]` (19 rule).
- Produces: `seedCompany(ex: Executor, companyId: string): Promise<void>` (idempoten), `createCompany(input: { name: string; npwp?: string | null; address?: string | null }): Promise<{ id: string }>`.
- Produces: `runSeed(): Promise<{ adminId: string; companyId: string }>` dari `app/seeds/index.ts`.
- Produces (test): `makeCompany(name?)`, `makeUser(opts?)`, `addMember(userId, companyId, role)`, `accountIdByCode(companyId, code)` di `tests/integration/factory.ts`.

- [ ] **Step 1: Data CoA dan rule**

`app/src/lib/server/company/coa-data.ts`:
```ts
export type AccountTypeSeed = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export interface CoaSeed {
	code: string;
	name: string;
	type: AccountTypeSeed;
	normalBal: 'DEBIT' | 'CREDIT';
	parent?: string;
}

export const BANK_ACCOUNT_CODE = '1-1002';

// Urutan penting: induk selalu muncul sebelum anaknya.
export const DEFAULT_COA: CoaSeed[] = [
	// ── ASET ──
	{ code: '1-0000', name: 'ASET', type: 'ASSET', normalBal: 'DEBIT' },
	{ code: '1-1000', name: 'Aset Lancar', type: 'ASSET', normalBal: 'DEBIT', parent: '1-0000' },
	{ code: '1-1001', name: 'Kas', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1002', name: 'Bank BCA', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1003', name: 'Piutang Usaha', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1004', name: 'Piutang Lain-lain', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1005', name: 'Persediaan', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1006', name: 'Beban Dibayar Dimuka', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-1007', name: 'Pajak Dibayar Dimuka', type: 'ASSET', normalBal: 'DEBIT', parent: '1-1000' },
	{ code: '1-2000', name: 'Aset Tidak Lancar', type: 'ASSET', normalBal: 'DEBIT', parent: '1-0000' },
	{ code: '1-2001', name: 'Investasi Jangka Panjang', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2000' },
	{ code: '1-2100', name: 'Aset Tetap', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2000' },
	{ code: '1-2101', name: 'Tanah', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2100' },
	{ code: '1-2102', name: 'Bangunan', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2100' },
	{ code: '1-2103', name: 'Kendaraan', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2100' },
	{ code: '1-2104', name: 'Peralatan & Mesin', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2100' },
	{ code: '1-2105', name: 'Inventaris Kantor', type: 'ASSET', normalBal: 'DEBIT', parent: '1-2100' },
	{ code: '1-2200', name: 'Akumulasi Penyusutan', type: 'ASSET', normalBal: 'CREDIT', parent: '1-2000' },
	{ code: '1-2201', name: 'Akum. Penyusutan Bangunan', type: 'ASSET', normalBal: 'CREDIT', parent: '1-2200' },
	{ code: '1-2202', name: 'Akum. Penyusutan Kendaraan', type: 'ASSET', normalBal: 'CREDIT', parent: '1-2200' },
	{ code: '1-2203', name: 'Akum. Penyusutan Peralatan', type: 'ASSET', normalBal: 'CREDIT', parent: '1-2200' },
	{ code: '1-2204', name: 'Akum. Penyusutan Inventaris', type: 'ASSET', normalBal: 'CREDIT', parent: '1-2200' },
	{ code: '1-3000', name: 'Aset Tak Berwujud', type: 'ASSET', normalBal: 'DEBIT', parent: '1-0000' },
	{ code: '1-3001', name: 'Goodwill', type: 'ASSET', normalBal: 'DEBIT', parent: '1-3000' },
	{ code: '1-3002', name: 'Hak Paten & Lisensi', type: 'ASSET', normalBal: 'DEBIT', parent: '1-3000' },
	// ── LIABILITAS ──
	{ code: '2-0000', name: 'LIABILITAS', type: 'LIABILITY', normalBal: 'CREDIT' },
	{ code: '2-1000', name: 'Liabilitas Jangka Pendek', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-0000' },
	{ code: '2-1001', name: 'Utang Usaha', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1002', name: 'Utang Pajak', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1003', name: 'Utang PPh 21', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1004', name: 'Utang PPh 23', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1005', name: 'Utang PPN', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1006', name: 'Beban Akrual', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1007', name: 'Pendapatan Diterima Dimuka', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-1008', name: 'Utang Bank Jangka Pendek', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-1000' },
	{ code: '2-2000', name: 'Liabilitas Jangka Panjang', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-0000' },
	{ code: '2-2001', name: 'Utang Bank Jangka Panjang', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-2000' },
	{ code: '2-2002', name: 'Liabilitas Imbalan Kerja', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-2000' },
	{ code: '2-2003', name: 'Utang Obligasi', type: 'LIABILITY', normalBal: 'CREDIT', parent: '2-2000' },
	// ── EKUITAS ──
	{ code: '3-0000', name: 'EKUITAS', type: 'EQUITY', normalBal: 'CREDIT' },
	{ code: '3-1001', name: 'Modal Saham Disetor', type: 'EQUITY', normalBal: 'CREDIT', parent: '3-0000' },
	{ code: '3-1002', name: 'Tambahan Modal Disetor (APIC)', type: 'EQUITY', normalBal: 'CREDIT', parent: '3-0000' },
	{ code: '3-1003', name: 'Saldo Laba Ditahan', type: 'EQUITY', normalBal: 'CREDIT', parent: '3-0000' },
	{ code: '3-1004', name: 'Laba Tahun Berjalan', type: 'EQUITY', normalBal: 'CREDIT', parent: '3-0000' },
	{ code: '3-1005', name: 'Dividen', type: 'EQUITY', normalBal: 'DEBIT', parent: '3-0000' },
	// ── PENDAPATAN ──
	{ code: '4-0000', name: 'PENDAPATAN', type: 'REVENUE', normalBal: 'CREDIT' },
	{ code: '4-1000', name: 'Pendapatan Usaha', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-0000' },
	{ code: '4-1001', name: 'Pendapatan Jasa', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-1000' },
	{ code: '4-1002', name: 'Pendapatan Penjualan', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-1000' },
	{ code: '4-1003', name: 'Retur & Potongan Penjualan', type: 'REVENUE', normalBal: 'DEBIT', parent: '4-1000' },
	{ code: '4-2000', name: 'Pendapatan Lain-lain', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-0000' },
	{ code: '4-2001', name: 'Pendapatan Bunga', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-2000' },
	{ code: '4-2002', name: 'Keuntungan Penjualan Aset', type: 'REVENUE', normalBal: 'CREDIT', parent: '4-2000' },
	// ── BEBAN ──
	{ code: '5-0000', name: 'BEBAN', type: 'EXPENSE', normalBal: 'DEBIT' },
	{ code: '5-1000', name: 'Harga Pokok Penjualan (HPP)', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-0000' },
	{ code: '5-1001', name: 'HPP — Bahan Baku', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-1000' },
	{ code: '5-1002', name: 'HPP — Tenaga Kerja Langsung', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-1000' },
	{ code: '5-1003', name: 'HPP — Overhead Pabrik', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-1000' },
	{ code: '5-2000', name: 'Beban Operasional', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-0000' },
	{ code: '5-2001', name: 'Beban Gaji & Tunjangan', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2002', name: 'Beban BPJS', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2003', name: 'Beban Sewa', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2004', name: 'Beban Listrik & Air', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2005', name: 'Beban Telepon & Internet', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2006', name: 'Beban Pemasaran & Iklan', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2007', name: 'Beban Perjalanan Dinas', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2008', name: 'Beban Perlengkapan Kantor', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2009', name: 'Beban Penyusutan', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2010', name: 'Beban Administrasi Bank', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2011', name: 'Beban Asuransi', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2012', name: 'Beban Pemeliharaan & Reparasi', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-2013', name: 'Beban Konsultan & Profesional', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-2000' },
	{ code: '5-3000', name: 'Beban Lain-lain', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-0000' },
	{ code: '5-3001', name: 'Beban Bunga', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-3000' },
	{ code: '5-3002', name: 'Kerugian Penjualan Aset', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-3000' },
	{ code: '5-3003', name: 'Beban Pajak Penghasilan', type: 'EXPENSE', normalBal: 'DEBIT', parent: '5-3000' }
];
```

`app/src/lib/server/company/rules-data.ts`:
```ts
export interface RuleSeed {
	keyword: string;
	account: string;
	direction: 'DB' | 'CR';
}

// D11: setiap rule seed punya arah. "BI-FAST" dari PRD sengaja tidak dimasukkan
// karena teks itu juga muncul pada transfer masuk (akan salah tercatat sebagai beban bank).
export const DEFAULT_RULES: RuleSeed[] = [
	// Bank & Admin
	{ keyword: 'BIAYA ADM', account: '5-2010', direction: 'DB' },
	{ keyword: 'PROVISI', account: '5-2010', direction: 'DB' },
	{ keyword: 'BUNGA PINJAMAN', account: '5-3001', direction: 'DB' },
	{ keyword: 'BUNGA TABUNGAN', account: '4-2001', direction: 'CR' },
	// Marketplace (uang masuk = penjualan)
	{ keyword: 'TOKOPEDIA', account: '4-1002', direction: 'CR' },
	{ keyword: 'SHOPEE', account: '4-1002', direction: 'CR' },
	{ keyword: 'LAZADA', account: '4-1002', direction: 'CR' },
	{ keyword: 'BUKALAPAK', account: '4-1002', direction: 'CR' },
	// Ride & Delivery
	{ keyword: 'GOJEK', account: '5-2006', direction: 'DB' },
	{ keyword: 'GRAB', account: '5-2006', direction: 'DB' },
	// Utilitas
	{ keyword: 'PLN', account: '5-2004', direction: 'DB' },
	{ keyword: 'PDAM', account: '5-2004', direction: 'DB' },
	{ keyword: 'TELKOM', account: '5-2005', direction: 'DB' },
	{ keyword: 'INDOSAT', account: '5-2005', direction: 'DB' },
	{ keyword: 'XL AXIATA', account: '5-2005', direction: 'DB' },
	// BPJS
	{ keyword: 'BPJS KESEHATAN', account: '5-2002', direction: 'DB' },
	{ keyword: 'BPJS KETENAGAKERJAAN', account: '5-2002', direction: 'DB' },
	// Retail
	{ keyword: 'ALFAMART', account: '5-2008', direction: 'DB' },
	{ keyword: 'INDOMARET', account: '5-2008', direction: 'DB' }
];
```

- [ ] **Step 2: Test data seed (unit) — gagal dulu**

`app/tests/unit/seed-data.test.ts`:
```ts
import { expect, test } from 'bun:test';
import { BANK_ACCOUNT_CODE, DEFAULT_COA } from '../../src/lib/server/company/coa-data';
import { DEFAULT_RULES } from '../../src/lib/server/company/rules-data';

test('CoA has 76 unique accounts and parents precede children', () => {
	expect(DEFAULT_COA).toHaveLength(76);
	const seen = new Set<string>();
	for (const a of DEFAULT_COA) {
		expect(seen.has(a.code)).toBe(false);
		if (a.parent) expect(seen.has(a.parent)).toBe(true);
		seen.add(a.code);
	}
	expect(seen.has(BANK_ACCOUNT_CODE)).toBe(true);
});

test('every rule points to a leaf account and has a direction', () => {
	const parents = new Set(DEFAULT_COA.map((a) => a.parent).filter(Boolean));
	const codes = new Set(DEFAULT_COA.map((a) => a.code));
	expect(DEFAULT_RULES).toHaveLength(19);
	for (const r of DEFAULT_RULES) {
		expect(codes.has(r.account)).toBe(true);
		expect(parents.has(r.account)).toBe(false);
		expect(['DB', 'CR']).toContain(r.direction);
	}
	expect(DEFAULT_RULES.some((r) => r.keyword === 'BI-FAST')).toBe(false);
});
```
Run: `cd app && bun test tests/unit/seed-data.test.ts`
Expected: PASS (data sudah ditulis di Step 1; test ini menjaga data dari regresi).

- [ ] **Step 3: Tulis test integration seed yang gagal**

`app/tests/integration/factory.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, companies, userCompanies } from '../../src/lib/server/db/schema';
import { createCompany } from '../../src/lib/server/company/seed-company';
import { createUserWithPassword } from '../../src/lib/server/users/create';

let seq = 0;

export async function makeCompany(name = 'PT Uji Coba'): Promise<{ companyId: string; bankAccountId: string }> {
	const { id } = await createCompany({ name });
	const company = await db.query.companies.findFirst({ where: eq(companies.id, id) });
	return { companyId: id, bankAccountId: company!.bankAccountId! };
}

export async function makeUser(opts: { email?: string; name?: string; isSuperAdmin?: boolean; password?: string } = {}) {
	seq += 1;
	return createUserWithPassword(db, {
		email: opts.email ?? `user${seq}@test.local`,
		name: opts.name ?? `User ${seq}`,
		password: opts.password ?? 'password123',
		isSuperAdmin: opts.isSuperAdmin ?? false
	});
}

export async function addMember(userId: string, companyId: string, role: 'admin' | 'accountant' | 'viewer') {
	await db.insert(userCompanies).values({ userId, companyId, role });
}

export async function accountIdByCode(companyId: string, code: string): Promise<string> {
	const row = await db.query.accounts.findFirst({
		where: and(eq(accounts.companyId, companyId), eq(accounts.code, code))
	});
	if (!row) throw new Error(`Akun ${code} tidak ada`);
	return row.id;
}
```

`app/tests/integration/seed.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, authAccount, categoryRules, companies, user, userCompanies } from '../../src/lib/server/db/schema';
import { seedCompany } from '../../src/lib/server/company/seed-company';
import { verifyPassword } from '../../src/lib/server/password';
import { runSeed } from '../../seeds/index';
import { accountIdByCode, makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('createCompany seeds CoA, rules and bank account', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const accs = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
	const rules = await db.select().from(categoryRules).where(eq(categoryRules.companyId, companyId));
	expect(accs).toHaveLength(76);
	expect(rules).toHaveLength(19);
	expect(rules.every((r) => r.source === 'SYSTEM' && r.priority === 0 && r.direction !== null)).toBe(true);
	expect(bankAccountId).toBe(await accountIdByCode(companyId, '1-1002'));
	const kas = accs.find((a) => a.code === '1-1001')!;
	expect(kas.parentId).toBe(accs.find((a) => a.code === '1-1000')!.id);
});

test('seedCompany is idempotent', async () => {
	const { companyId } = await makeCompany();
	await seedCompany(db, companyId);
	const accs = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
	expect(accs).toHaveLength(76);
});

test('runSeed creates super admin + demo company once', async () => {
	process.env.SEED_ADMIN_EMAIL = 'Admin@Jurnalku.Local';
	process.env.SEED_ADMIN_PASSWORD = 'rahasia-sekali';
	const first = await runSeed();
	const second = await runSeed();
	expect(second).toEqual(first);
	const users = await db.select().from(user);
	expect(users).toHaveLength(1);
	expect(users[0].email).toBe('admin@jurnalku.local');
	expect(users[0].isSuperAdmin).toBe(true);
	const [cred] = await db.select().from(authAccount).where(eq(authAccount.userId, users[0].id));
	expect(cred.providerId).toBe('credential');
	expect(await verifyPassword('rahasia-sekali', cred.password!)).toBe(true);
	expect(await db.select().from(companies)).toHaveLength(1);
	const memberships = await db
		.select()
		.from(userCompanies)
		.where(and(eq(userCompanies.userId, first.adminId), eq(userCompanies.companyId, first.companyId)));
	expect(memberships[0].role).toBe('admin');
});

test('runSeed refuses short password', async () => {
	process.env.SEED_ADMIN_PASSWORD = 'short';
	await expect(runSeed()).rejects.toThrow('SEED_ADMIN_PASSWORD');
});
```

Run: `cd app && bun test tests/integration/seed.test.ts`
Expected: FAIL — module `seed-company` / `seeds/index` tidak ditemukan.

- [ ] **Step 4: Implementasi**

`app/src/lib/server/password.ts`:
```ts
export function hashPassword(password: string): Promise<string> {
	return Bun.password.hash(password, { algorithm: 'argon2id' });
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
	return Bun.password.verify(password, hash);
}
```

`app/src/lib/server/users/create.ts`:
```ts
import { eq } from 'drizzle-orm';
import type { Executor } from '../db';
import { authAccount, user } from '../db/schema';
import { hashPassword } from '../password';

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export async function createUserWithPassword(
	ex: Executor,
	input: { email: string; name: string; password: string; isSuperAdmin?: boolean }
): Promise<{ id: string; email: string; name: string; isSuperAdmin: boolean }> {
	const hash = await hashPassword(input.password);
	const [created] = await ex
		.insert(user)
		.values({
			email: normalizeEmail(input.email),
			name: input.name.trim(),
			emailVerified: true,
			isSuperAdmin: input.isSuperAdmin ?? false
		})
		.returning({ id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin });
	// Format akun credential Better Auth: accountId = userId, providerId = 'credential'.
	await ex.insert(authAccount).values({
		userId: created.id,
		accountId: created.id,
		providerId: 'credential',
		password: hash
	});
	return created;
}

export async function findUserByEmail(ex: Executor, email: string) {
	const [row] = await ex
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			isSuperAdmin: user.isSuperAdmin,
			isActive: user.isActive
		})
		.from(user)
		.where(eq(user.email, normalizeEmail(email)))
		.limit(1);
	return row ?? null;
}
```

`app/src/lib/server/company/seed-company.ts`:
```ts
import { eq } from 'drizzle-orm';
import { db, type Executor } from '../db';
import { accounts, categoryRules, companies } from '../db/schema';
import { BANK_ACCOUNT_CODE, DEFAULT_COA } from './coa-data';
import { DEFAULT_RULES } from './rules-data';

/** Isi CoA PSAK default + rule SYSTEM + akun bank untuk satu perusahaan. Idempoten. */
export async function seedCompany(ex: Executor, companyId: string): Promise<void> {
	const existing = await ex
		.select({ id: accounts.id })
		.from(accounts)
		.where(eq(accounts.companyId, companyId))
		.limit(1);
	if (existing.length > 0) return;

	const idByCode = new Map<string, string>();
	for (const a of DEFAULT_COA) {
		const [row] = await ex
			.insert(accounts)
			.values({
				companyId,
				code: a.code,
				name: a.name,
				type: a.type,
				normalBal: a.normalBal,
				parentId: a.parent ? idByCode.get(a.parent)! : null
			})
			.returning({ id: accounts.id });
		idByCode.set(a.code, row.id);
	}

	await ex.insert(categoryRules).values(
		DEFAULT_RULES.map((r) => ({
			companyId,
			keywordPattern: r.keyword,
			accountId: idByCode.get(r.account)!,
			direction: r.direction,
			priority: 0,
			source: 'SYSTEM' as const
		}))
	);

	await ex
		.update(companies)
		.set({ bankAccountId: idByCode.get(BANK_ACCOUNT_CODE)! })
		.where(eq(companies.id, companyId));
}

export async function createCompany(input: {
	name: string;
	npwp?: string | null;
	address?: string | null;
}): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const [company] = await tx
			.insert(companies)
			.values({ name: input.name.trim(), npwp: input.npwp ?? null, address: input.address ?? null })
			.returning({ id: companies.id });
		await seedCompany(tx, company.id);
		return company;
	});
}
```

`app/seeds/index.ts`:
```ts
import { eq } from 'drizzle-orm';
import { client, db } from '../src/lib/server/db';
import { companies, userCompanies } from '../src/lib/server/db/schema';
import { createCompany } from '../src/lib/server/company/seed-company';
import { createUserWithPassword, findUserByEmail } from '../src/lib/server/users/create';

const DEMO_COMPANY = 'PT Demo Perusahaan';

export async function runSeed(): Promise<{ adminId: string; companyId: string }> {
	const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@jurnalku.local';
	const password = process.env.SEED_ADMIN_PASSWORD;
	if (!password || password.length < 8) {
		throw new Error('SEED_ADMIN_PASSWORD wajib diisi (minimal 8 karakter)');
	}

	const admin =
		(await findUserByEmail(db, email)) ??
		(await createUserWithPassword(db, { email, name: 'Super Admin', password, isSuperAdmin: true }));

	const demo = await db.query.companies.findFirst({ where: eq(companies.name, DEMO_COMPANY) });
	const companyId = demo?.id ?? (await createCompany({ name: DEMO_COMPANY, npwp: '00.000.000.0-000.000' })).id;

	await db.insert(userCompanies).values({ userId: admin.id, companyId, role: 'admin' }).onConflictDoNothing();
	return { adminId: admin.id, companyId };
}

if (import.meta.main) {
	runSeed()
		.then(({ companyId }) => {
			console.log(`Seed selesai. Perusahaan demo: ${companyId}`);
			return client.end();
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
```

- [ ] **Step 5: Jalankan test**

Run: `cd app && bun test tests/unit/seed-data.test.ts tests/integration/seed.test.ts`
Expected: semua PASS.

- [ ] **Step 6: Seed DB dev**

Run: `cd app && bun run db:seed && bun run db:seed`
Expected: dua kali `Seed selesai. Perusahaan demo: <uuid>` dengan uuid sama.

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/server/password.ts app/src/lib/server/users app/src/lib/server/company app/seeds app/tests
git commit -m "feat(app): company seeding (PSAK CoA + directional rules), user creation and db:seed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Auth (Better Auth) + RBAC core + helper API

**Files:**
- Create: `app/src/lib/roles.ts`, `app/src/lib/server/api.ts`, `app/src/lib/server/validation.ts`, `app/src/lib/server/rbac.ts`, `app/src/lib/server/auth.ts`
- Modify: `app/src/app.d.ts`, `app/tests/integration/factory.ts`
- Test: `app/tests/unit/roles.test.ts`, `app/tests/unit/api.test.ts`, `app/tests/integration/rbac.test.ts`

**Interfaces:**
- Consumes: `db`, schema, `hashPassword`/`verifyPassword` (Task 4–5).
- Produces (`$lib/roles`): `type Role = 'viewer' | 'accountant' | 'admin'`, `ROLES`, `ROLE_LABELS`, `roleAtLeast(role: Role | null | undefined, min: Role): boolean`.
- Produces (`server/api.ts`): `class ApiError(status: number, code: string, message: string, details?: unknown)`, `apiHandler(fn: () => Promise<Response>): Promise<Response>`, `parseJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>>`, `notFound(what?: string): ApiError`.
- Produces (`server/validation.ts`): `moneyString`, `isoDate`, `uuidSchema` (zod), `parseId(value, what?): string` (404 bila bukan UUID), `dateParam(url: URL, name: string): string | null`.
- Produces (`server/rbac.ts`): `COMPANY_COOKIE = 'jk_company'`, `SessionUser`, `CompanyMembership`, `AppContext`, `ActiveContext`, `resolveContext(user: SessionUser, requestedCompanyId?: string | null): Promise<AppContext>`, `requireUser(event)`, `requireCompany(event)`, `requireRole(event, min)`, `requireSuperAdmin(event)`, `requirePageRole(event, min)`.
- Produces (`server/auth.ts`): `getAuth()` → instance Better Auth (lazy; hanya dipakai oleh `hooks.server.ts`, login, logout).
- Produces (test): `contextFor(user, companyId?)` di factory.

- [ ] **Step 1: Tulis test unit yang gagal**

`app/tests/unit/roles.test.ts`:
```ts
import { expect, test } from 'bun:test';
import { roleAtLeast } from '$lib/roles';

test('roleAtLeast ordering', () => {
	expect(roleAtLeast('admin', 'accountant')).toBe(true);
	expect(roleAtLeast('accountant', 'accountant')).toBe(true);
	expect(roleAtLeast('viewer', 'accountant')).toBe(false);
	expect(roleAtLeast(null, 'viewer')).toBe(false);
});
```

`app/tests/unit/api.test.ts`:
```ts
import { expect, test } from 'bun:test';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { ApiError, apiHandler, parseJson } from '../../src/lib/server/api';

test('ApiError becomes JSON error response', async () => {
	const res = await apiHandler(async () => {
		throw new ApiError(409, 'duplicate_statement', 'Sudah ada');
	});
	expect(res.status).toBe(409);
	expect(await res.json()).toEqual({ error: { code: 'duplicate_statement', message: 'Sudah ada' } });
});

test('ZodError becomes 400 validation_error', async () => {
	const res = await apiHandler(async () => {
		z.object({ a: z.string() }).parse({});
		return json({});
	});
	expect(res.status).toBe(400);
	expect((await res.json()).error.code).toBe('validation_error');
});

test('unknown error becomes 500 without leaking message', async () => {
	const res = await apiHandler(async () => {
		throw new Error('secret db detail');
	});
	expect(res.status).toBe(500);
	expect(JSON.stringify(await res.json())).not.toContain('secret');
});

test('parseJson rejects non-JSON body', async () => {
	const req = new Request('http://x', { method: 'POST', body: 'not json' });
	await expect(parseJson(req, z.object({}))).rejects.toMatchObject({ status: 400, code: 'invalid_json' });
});
```

Run: `cd app && bun run test:unit`
Expected: FAIL — module `$lib/roles` / `server/api` tidak ditemukan.

- [ ] **Step 2: Implementasi roles, api, validation**

`app/src/lib/roles.ts`:
```ts
export type Role = 'viewer' | 'accountant' | 'admin';

export const ROLES: Role[] = ['viewer', 'accountant', 'admin'];

export const ROLE_LABELS: Record<Role, string> = {
	viewer: 'Viewer',
	accountant: 'Akuntan',
	admin: 'Admin'
};

const RANK: Record<Role, number> = { viewer: 0, accountant: 1, admin: 2 };

export function roleAtLeast(role: Role | null | undefined, min: Role): boolean {
	return !!role && RANK[role] >= RANK[min];
}
```

`app/src/lib/server/api.ts`:
```ts
import { json } from '@sveltejs/kit';
import { z } from 'zod';

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
		public details?: unknown
	) {
		super(message);
	}
}

export function notFound(what = 'Data'): ApiError {
	return new ApiError(404, 'not_found', `${what} tidak ditemukan`);
}

export async function apiHandler(fn: () => Promise<Response>): Promise<Response> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof ApiError) {
			const error: Record<string, unknown> = { code: e.code, message: e.message };
			if (e.details !== undefined) error.details = e.details;
			return json({ error }, { status: e.status });
		}
		if (e instanceof z.ZodError) {
			return json(
				{ error: { code: 'validation_error', message: 'Input tidak valid', details: e.issues } },
				{ status: 400 }
			);
		}
		console.error(e);
		return json(
			{ error: { code: 'internal_error', message: 'Terjadi kesalahan pada server' } },
			{ status: 500 }
		);
	}
}

export async function parseJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new ApiError(400, 'invalid_json', 'Body request harus JSON yang valid');
	}
	return schema.parse(body);
}
```

`app/src/lib/server/validation.ts`:
```ts
import { z } from 'zod';
import { ApiError, notFound } from './api';

export const moneyString = z
	.string()
	.trim()
	.regex(/^\d{1,16}(\.\d{1,2})?$/, 'Format nominal tidak valid (contoh: 1500000.00)');
export const isoDate = z.iso.date();
export const uuidSchema = z.uuid();

/** Validasi ID dari URL; ID yang bukan UUID diperlakukan sebagai "tidak ditemukan". */
export function parseId(value: string | undefined | null, what = 'Data'): string {
	const r = uuidSchema.safeParse(value);
	if (!r.success) throw notFound(what);
	return r.data;
}

export function dateParam(url: URL, name: string): string | null {
	const v = url.searchParams.get(name);
	if (!v) return null;
	const r = isoDate.safeParse(v);
	if (!r.success) throw new ApiError(400, 'validation_error', `Parameter ${name} harus berformat YYYY-MM-DD`);
	return r.data;
}
```

Run: `cd app && bun run test:unit`
Expected: PASS.

- [ ] **Step 3: Tulis test integration RBAC yang gagal**

Tambahkan ke `app/tests/integration/factory.ts`:
```ts
import { resolveContext, type AppContext } from '../../src/lib/server/rbac';

export async function contextFor(
	u: { id: string; email: string; name: string; isSuperAdmin: boolean },
	companyId?: string
): Promise<AppContext> {
	return resolveContext(
		{ id: u.id, email: u.email, name: u.name, isSuperAdmin: u.isSuperAdmin },
		companyId ?? null
	);
}
```

`app/tests/integration/rbac.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { requireCompany, requireRole, requireSuperAdmin, requireUser } from '../../src/lib/server/rbac';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const ev = (ctx: Awaited<ReturnType<typeof contextFor>> | null) => ({ locals: { ctx } }) as never;

test('member only sees own companies with own role', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const u = await makeUser();
	await addMember(u.id, a.companyId, 'accountant');
	const ctx = await contextFor(u, a.companyId);
	expect(ctx.companies.map((c) => c.id)).toEqual([a.companyId]);
	expect(ctx.companyId).toBe(a.companyId);
	expect(ctx.role).toBe('accountant');
	expect(ctx.companies.some((c) => c.id === b.companyId)).toBe(false);
});

test('tampered company cookie falls back to own company', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const u = await makeUser();
	await addMember(u.id, a.companyId, 'viewer');
	const ctx = await contextFor(u, b.companyId);
	expect(ctx.companyId).toBe(a.companyId);
	expect(ctx.role).toBe('viewer');
});

test('super admin sees every company as admin', async () => {
	await makeCompany('PT A');
	await makeCompany('PT B');
	const su = await makeUser({ isSuperAdmin: true });
	const ctx = await contextFor(su);
	expect(ctx.companies).toHaveLength(2);
	expect(ctx.companies.every((c) => c.role === 'admin')).toBe(true);
	expect(ctx.role).toBe('admin');
});

test('user without company has null company and gets no_company', async () => {
	const u = await makeUser();
	const ctx = await contextFor(u);
	expect(ctx.companyId).toBeNull();
	expect(() => requireCompany(ev(ctx))).toThrow(expect.objectContaining({ status: 409, code: 'no_company' }));
});

test('require helpers enforce auth and role', async () => {
	const a = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, a.companyId, 'viewer');
	const ctx = await contextFor(u);
	expect(() => requireUser(ev(null))).toThrow(expect.objectContaining({ status: 401 }));
	expect(requireRole(ev(ctx), 'viewer').companyId).toBe(a.companyId);
	expect(() => requireRole(ev(ctx), 'accountant')).toThrow(expect.objectContaining({ status: 403 }));
	expect(() => requireSuperAdmin(ev(ctx))).toThrow(expect.objectContaining({ status: 403 }));
});
```

Run: `cd app && bun test tests/integration/rbac.test.ts`
Expected: FAIL — module `rbac` tidak ditemukan.

- [ ] **Step 4: Implementasi RBAC, auth, tipe Locals**

`app/src/lib/server/rbac.ts`:
```ts
import { error, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { roleAtLeast, type Role } from '../roles';
import { ApiError } from './api';
import { db } from './db';
import { companies, userCompanies } from './db/schema';

export type { Role } from '../roles';

export const COMPANY_COOKIE = 'jk_company';

export interface SessionUser {
	id: string;
	email: string;
	name: string;
	isSuperAdmin: boolean;
}
export interface CompanyMembership {
	id: string;
	name: string;
	role: Role;
}
export interface AppContext {
	user: SessionUser;
	companies: CompanyMembership[];
	companyId: string | null;
	role: Role | null;
}
export interface ActiveContext extends AppContext {
	companyId: string;
	role: Role;
}

interface HasLocals {
	locals: { ctx: AppContext | null };
}

export async function resolveContext(user: SessionUser, requestedCompanyId?: string | null): Promise<AppContext> {
	const memberships: CompanyMembership[] = user.isSuperAdmin
		? (
				await db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(asc(companies.name))
			).map((c) => ({ ...c, role: 'admin' as const }))
		: await db
				.select({ id: companies.id, name: companies.name, role: userCompanies.role })
				.from(userCompanies)
				.innerJoin(companies, eq(companies.id, userCompanies.companyId))
				.where(eq(userCompanies.userId, user.id))
				.orderBy(asc(companies.name));
	const active = memberships.find((c) => c.id === requestedCompanyId) ?? memberships[0] ?? null;
	return { user, companies: memberships, companyId: active?.id ?? null, role: active?.role ?? null };
}

export function requireUser(event: HasLocals): AppContext {
	const ctx = event.locals.ctx;
	if (!ctx) throw new ApiError(401, 'unauthenticated', 'Silakan login terlebih dahulu');
	return ctx;
}

export function requireCompany(event: HasLocals): ActiveContext {
	const ctx = requireUser(event);
	if (!ctx.companyId || !ctx.role) {
		throw new ApiError(409, 'no_company', 'Akun Anda belum terhubung ke perusahaan');
	}
	return ctx as ActiveContext;
}

export function requireRole(event: HasLocals, min: Role): ActiveContext {
	const ctx = requireCompany(event);
	if (!roleAtLeast(ctx.role, min)) {
		throw new ApiError(403, 'forbidden', 'Anda tidak memiliki akses untuk tindakan ini');
	}
	return ctx;
}

export function requireSuperAdmin(event: HasLocals): AppContext {
	const ctx = requireUser(event);
	if (!ctx.user.isSuperAdmin) {
		throw new ApiError(403, 'forbidden', 'Hanya super admin yang dapat melakukan tindakan ini');
	}
	return ctx;
}

/** Versi untuk load function halaman: 401 → redirect login, lainnya → halaman error SvelteKit. */
export function requirePageRole(event: HasLocals, min: Role): ActiveContext {
	try {
		return requireRole(event, min);
	} catch (e) {
		if (e instanceof ApiError) {
			if (e.status === 401) redirect(303, '/login');
			error(e.status, e.message);
		}
		throw e;
	}
}
```

`app/src/lib/server/auth.ts`:
```ts
import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { db } from './db';
import { authAccount, session, user, verification } from './db/schema';
import { env } from './env';
import { hashPassword, verifyPassword } from './password';

function createAuth() {
	return betterAuth({
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: { user, session, account: authAccount, verification }
	}),
	advanced: { database: { generateId: 'uuid' } },
	emailAndPassword: {
		enabled: true,
		disableSignUp: true, // D3: user hanya dibuat oleh admin
		minPasswordLength: 8,
		password: {
			hash: hashPassword,
			verify: ({ hash, password }) => verifyPassword(password, hash)
		}
	},
	user: {
		additionalFields: {
			isSuperAdmin: { type: 'boolean', defaultValue: false, input: false },
			isActive: { type: 'boolean', defaultValue: true, input: false }
		}
	},
	plugins: [sveltekitCookies(getRequestEvent)]
	});
}

let instance: ReturnType<typeof createAuth> | null = null;

/** Dibuat saat pertama dipakai (bukan saat import) supaya `vite build` tidak butuh env runtime. */
export function getAuth() {
	return (instance ??= createAuth());
}
```

`app/src/app.d.ts` (ganti seluruh isi):
```ts
import type { AppContext } from '$lib/server/rbac';

declare global {
	namespace App {
		interface Locals {
			ctx: AppContext | null;
		}
	}
}

export {};
```

- [ ] **Step 5: Jalankan test**

Run: `cd app && bun run test`
Expected: semua unit + integration PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/roles.ts app/src/lib/server/api.ts app/src/lib/server/validation.ts app/src/lib/server/rbac.ts app/src/lib/server/auth.ts app/src/app.d.ts app/tests
git commit -m "feat(app): Better Auth config, RBAC context resolution and API error helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Hooks, login/logout, app shell (sidebar + company switcher), API perusahaan aktif

**Files:**
- Create: `app/src/hooks.server.ts`, `app/src/lib/nav.ts`
- Create: `app/src/routes/login/+page.svelte`, `app/src/routes/login/+page.server.ts`, `app/src/routes/logout/+server.ts`
- Create: `app/src/routes/(app)/+layout.server.ts`, `app/src/routes/(app)/+layout.svelte`
- Create: `app/src/routes/(app)/dashboard/+page.svelte` (placeholder; diisi penuh di Task 16)
- Create: `app/src/routes/api/companies/+server.ts`, `app/src/routes/api/companies/switch/+server.ts`
- Create: `app/tests/integration/event.ts`
- Test: `app/tests/unit/nav.test.ts`, `app/tests/integration/companies-api.test.ts`

**Interfaces:**
- Consumes: `getAuth`, `resolveContext`, `COMPANY_COOKIE`, `requireUser`, `apiHandler`, `parseJson`, `notFound`, `roleAtLeast`.
- Produces (`$lib/nav`): `NavItem { label; href; min: Role }`, `NavGroup { label: string | null; items: NavItem[] }`, `NAV`, `visibleNav(role): NavGroup[]`, `minRoleForPath(pathname): Role | null`.
- Produces: layout data `(app)` = `{ ctx: AppContext; nav: NavGroup[] }`.
- Produces: `GET /api/companies` → `{ companies: CompanyMembership[]; activeCompanyId }`; `POST /api/companies/switch { companyId }` → `{ ok: true }` + cookie `jk_company`.
- Produces (test): `fakeEvent(opts)`, `call(handler, event)` di `tests/integration/event.ts`.
- `resumePendingJobs` dipanggil dari hook `init` mulai Task 11 (belum di task ini).

- [ ] **Step 1: Test nav (unit) yang gagal**

`app/tests/unit/nav.test.ts`:
```ts
import { expect, test } from 'bun:test';
import { minRoleForPath, visibleNav } from '$lib/nav';

test('viewer does not see write menus', () => {
	const hrefs = visibleNav('viewer').flatMap((g) => g.items.map((i) => i.href));
	expect(hrefs).toContain('/uploads');
	expect(hrefs).toContain('/trial-balance');
	expect(hrefs).not.toContain('/uploads/new');
	expect(hrefs).not.toContain('/review');
	expect(hrefs).not.toContain('/settings/users');
});

test('accountant sees review and rules but not user management', () => {
	const hrefs = visibleNav('accountant').flatMap((g) => g.items.map((i) => i.href));
	expect(hrefs).toContain('/review');
	expect(hrefs).toContain('/settings/rules');
	expect(hrefs).not.toContain('/settings/users');
});

test('minRoleForPath uses longest prefix', () => {
	expect(minRoleForPath('/uploads')).toBe('viewer');
	expect(minRoleForPath('/uploads/123')).toBe('viewer');
	expect(minRoleForPath('/uploads/new')).toBe('accountant');
	expect(minRoleForPath('/settings/users')).toBe('admin');
	expect(minRoleForPath('/unknown')).toBeNull();
});
```
Run: `cd app && bun run test:unit` → Expected: FAIL (`$lib/nav` belum ada).

- [ ] **Step 2: Implementasi nav**

`app/src/lib/nav.ts`:
```ts
import { roleAtLeast, type Role } from './roles';

export interface NavItem {
	label: string;
	href: string;
	min: Role;
}
export interface NavGroup {
	label: string | null;
	items: NavItem[];
}

// Menu laporan keuangan, CALK, export, dan preferensi sistem belum dibangun di slice ini.
export const NAV: NavGroup[] = [
	{ label: null, items: [{ label: 'Dashboard', href: '/dashboard', min: 'viewer' }] },
	{
		label: 'eStatement',
		items: [
			{ label: 'Upload Baru', href: '/uploads/new', min: 'accountant' },
			{ label: 'Riwayat Upload', href: '/uploads', min: 'viewer' }
		]
	},
	{ label: null, items: [{ label: 'Review & Konfirmasi', href: '/review', min: 'accountant' }] },
	{ label: 'Jurnal', items: [{ label: 'Jurnal Umum', href: '/journal', min: 'viewer' }] },
	{
		label: 'Buku',
		items: [
			{ label: 'Buku Besar', href: '/ledger', min: 'viewer' },
			{ label: 'Neraca Saldo', href: '/trial-balance', min: 'viewer' }
		]
	},
	{
		label: 'Pengaturan',
		items: [
			{ label: 'Perusahaan', href: '/settings/company', min: 'admin' },
			{ label: 'Pengguna & Role', href: '/settings/users', min: 'admin' },
			{ label: 'Chart of Accounts', href: '/settings/accounts', min: 'admin' },
			{ label: 'Category Rules', href: '/settings/rules', min: 'accountant' },
			{ label: 'Saldo Awal', href: '/settings/opening-balance', min: 'accountant' }
		]
	}
];

export function visibleNav(role: Role | null): NavGroup[] {
	return NAV.map((g) => ({ ...g, items: g.items.filter((i) => roleAtLeast(role, i.min)) })).filter(
		(g) => g.items.length > 0
	);
}

export function minRoleForPath(pathname: string): Role | null {
	let best: NavItem | null = null;
	for (const g of NAV) {
		for (const i of g.items) {
			const match = pathname === i.href || pathname.startsWith(`${i.href}/`);
			if (match && (!best || i.href.length > best.href.length)) best = i;
		}
	}
	return best?.min ?? null;
}
```
Run: `cd app && bun run test:unit` → Expected: PASS.

- [ ] **Step 3: Helper event palsu + test API perusahaan yang gagal**

`app/tests/integration/event.ts`:
```ts
import type { AppContext } from '../../src/lib/server/rbac';

type Handler = (event: never) => Response | Promise<Response>;

export function fakeEvent(opts: {
	ctx: AppContext | null;
	method?: string;
	path?: string;
	body?: unknown;
	form?: FormData;
	params?: Record<string, string>;
}) {
	const url = new URL(opts.path ?? '/', 'http://localhost');
	const init: RequestInit = { method: opts.method ?? 'GET' };
	if (opts.form) init.body = opts.form;
	else if (opts.body !== undefined) {
		init.body = JSON.stringify(opts.body);
		init.headers = { 'content-type': 'application/json' };
	}
	const jar: Record<string, string> = {};
	const cookies = {
		get: (n: string) => jar[n],
		getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
		set: (n: string, v: string) => {
			jar[n] = v;
		},
		delete: (n: string) => {
			delete jar[n];
		},
		serialize: () => ''
	};
	return {
		locals: { ctx: opts.ctx },
		request: new Request(url, init),
		url,
		params: opts.params ?? {},
		cookies,
		jar
	};
}

export async function call(handler: Handler, event: ReturnType<typeof fakeEvent>) {
	const res = await handler(event as never);
	const text = await res.text();
	return { status: res.status, body: text ? JSON.parse(text) : null };
}
```

`app/tests/integration/companies-api.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { GET } from '../../src/routes/api/companies/+server';
import { POST as SWITCH } from '../../src/routes/api/companies/switch/+server';
import { COMPANY_COOKIE } from '../../src/lib/server/rbac';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

test('lists own companies', async () => {
	const a = await makeCompany('PT A');
	const u = await makeUser();
	await addMember(u.id, a.companyId, 'viewer');
	const res = await call(GET, fakeEvent({ ctx: await contextFor(u) }));
	expect(res.status).toBe(200);
	expect(res.body.companies.map((c: { id: string }) => c.id)).toEqual([a.companyId]);
	expect(res.body.activeCompanyId).toBe(a.companyId);
});

test('switch to own company sets cookie; foreign company is 404; anonymous is 401', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const c = await makeCompany('PT C');
	const u = await makeUser();
	await addMember(u.id, a.companyId, 'viewer');
	await addMember(u.id, b.companyId, 'admin');
	const ctx = await contextFor(u);

	const ok = fakeEvent({ ctx, method: 'POST', body: { companyId: b.companyId } });
	expect((await call(SWITCH, ok)).status).toBe(200);
	expect(ok.jar[COMPANY_COOKIE]).toBe(b.companyId);

	const foreign = fakeEvent({ ctx, method: 'POST', body: { companyId: c.companyId } });
	expect((await call(SWITCH, foreign)).status).toBe(404);

	const anon = fakeEvent({ ctx: null, method: 'POST', body: { companyId: a.companyId } });
	expect((await call(SWITCH, anon)).status).toBe(401);
});
```
Run: `cd app && bun test tests/integration/companies-api.test.ts` → Expected: FAIL (route belum ada).

- [ ] **Step 4: Implementasi API perusahaan**

`app/src/routes/api/companies/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { requireUser } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireUser(event);
		return json({ companies: ctx.companies, activeCompanyId: ctx.companyId });
	});
```

`app/src/routes/api/companies/switch/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { apiHandler, notFound, parseJson } from '$lib/server/api';
import { COMPANY_COOKIE, requireUser } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

const Body = z.object({ companyId: z.string() });

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireUser(event);
		const { companyId } = await parseJson(event.request, Body);
		if (!ctx.companies.some((c) => c.id === companyId)) throw notFound('Perusahaan');
		event.cookies.set(COMPANY_COOKIE, companyId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: event.url.protocol === 'https:',
			maxAge: 60 * 60 * 24 * 365
		});
		return json({ ok: true });
	});
```
Run: `cd app && bun test tests/integration/companies-api.test.ts` → Expected: PASS. (Jika `./$types` belum ada, jalankan `bunx svelte-kit sync`; script `test` sudah melakukannya.)

- [ ] **Step 5: Hooks, login, logout**

`app/src/hooks.server.ts`:
```ts
import { building } from '$app/environment';
import { redirect, type Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getAuth } from '$lib/server/auth';
import { COMPANY_COOKIE, resolveContext } from '$lib/server/rbac';

const PUBLIC_PATHS = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
	const auth = getAuth();
	event.locals.ctx = null;
	const path = event.url.pathname;

	if (!building && !path.startsWith('/api/auth')) {
		const session = await auth.api.getSession({ headers: event.request.headers });
		if (session && session.user.isActive) {
			event.locals.ctx = await resolveContext(
				{
					id: session.user.id,
					email: session.user.email,
					name: session.user.name,
					isSuperAdmin: session.user.isSuperAdmin
				},
				event.cookies.get(COMPANY_COOKIE)
			);
		}
	}

	const isPublic = PUBLIC_PATHS.includes(path) || path.startsWith('/api/');
	if (!event.locals.ctx && !isPublic) redirect(303, '/login');

	return svelteKitHandler({ event, resolve, auth, building });
};
```
(Endpoint `/api/*` tidak di-redirect; mereka menjawab 401 JSON lewat `requireUser`.)

`app/src/routes/login/+page.server.ts`:
```ts
import { fail, redirect } from '@sveltejs/kit';
import { getAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { findUserByEmail } from '$lib/server/users/create';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.ctx) redirect(303, '/dashboard');
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const invalid = () => fail(400, { email, message: 'Email atau password salah' });

		const existing = await findUserByEmail(db, email);
		if (!existing || !existing.isActive) return invalid();
		try {
			await getAuth().api.signInEmail({ body: { email: existing.email, password }, headers: request.headers });
		} catch {
			return invalid();
		}
		redirect(303, '/dashboard');
	}
};
```

`app/src/routes/login/+page.svelte`:
```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	let { form } = $props();
	let submitting = $state(false);
</script>

<div class="flex min-h-screen items-center justify-center bg-slate-50 p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title class="text-2xl">Jurnalku</Card.Title>
			<Card.Description>Masuk untuk melanjutkan</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				class="space-y-4"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" name="email" type="email" autocomplete="username" value={form?.email ?? ''} required />
				</div>
				<div class="space-y-2">
					<Label for="password">Password</Label>
					<Input id="password" name="password" type="password" autocomplete="current-password" required />
				</div>
				{#if form?.message}
					<p class="text-sm text-red-600">{form.message}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={submitting}>
					{submitting ? 'Memproses…' : 'Masuk'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
```

`app/src/routes/logout/+server.ts`:
```ts
import { redirect } from '@sveltejs/kit';
import { getAuth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	await getAuth().api.signOut({ headers: request.headers });
	redirect(303, '/login');
};
```

- [ ] **Step 6: App shell**

`app/src/routes/(app)/+layout.server.ts`:
```ts
import { error, redirect } from '@sveltejs/kit';
import { minRoleForPath, visibleNav } from '$lib/nav';
import { roleAtLeast } from '$lib/roles';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	const ctx = locals.ctx;
	if (!ctx) redirect(303, '/login');
	const min = minRoleForPath(url.pathname);
	if (ctx.companyId && min && !roleAtLeast(ctx.role, min)) {
		error(403, 'Anda tidak memiliki akses ke halaman ini');
	}
	return { ctx, nav: visibleNav(ctx.role) };
};
```

`app/src/routes/(app)/+layout.svelte`:
```svelte
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { ROLE_LABELS } from '$lib/roles';

	let { data, children } = $props();
	const ctx = $derived(data.ctx);

	async function switchCompany(e: Event) {
		const companyId = (e.currentTarget as HTMLSelectElement).value;
		await fetch('/api/companies/switch', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ companyId })
		});
		await invalidateAll();
		await goto('/dashboard');
	}

	const isActive = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<div class="flex min-h-screen bg-slate-50">
	<aside class="flex w-64 shrink-0 flex-col border-r bg-white">
		<div class="border-b p-4">
			<a href="/dashboard" class="text-lg font-semibold">Jurnalku</a>
			{#if ctx.companies.length > 0}
				<select
					class="mt-3 w-full rounded-md border px-2 py-1.5 text-sm"
					value={ctx.companyId}
					onchange={switchCompany}
					aria-label="Pilih perusahaan"
				>
					{#each ctx.companies as c (c.id)}
						<option value={c.id}>{c.name}</option>
					{/each}
				</select>
			{/if}
			{#if ctx.user.isSuperAdmin}
				<a href="/settings/company?new=1" class="mt-2 block text-xs text-blue-600 hover:underline">+ Perusahaan baru</a>
			{/if}
		</div>
		<nav class="flex-1 space-y-4 overflow-y-auto p-3 text-sm">
			{#each data.nav as group, gi (gi)}
				<div>
					{#if group.label}
						<p class="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{group.label}</p>
					{/if}
					{#each group.items as item (item.href)}
						<a
							href={item.href}
							class="block rounded-md px-2 py-1.5 hover:bg-slate-100 {isActive(item.href) ? 'bg-slate-100 font-medium' : ''}"
						>
							{item.label}
						</a>
					{/each}
				</div>
			{/each}
		</nav>
		<div class="border-t p-4 text-sm">
			<p class="font-medium">{ctx.user.name}</p>
			<p class="text-xs text-slate-500">
				{ctx.user.isSuperAdmin ? 'Super Admin' : ctx.role ? ROLE_LABELS[ctx.role] : '—'}
			</p>
			<form method="POST" action="/logout" class="mt-2">
				<button class="text-xs text-red-600 hover:underline">Keluar</button>
			</form>
		</div>
	</aside>
	<main class="min-w-0 flex-1 p-6">
		{#if ctx.companyId}
			{@render children()}
		{:else}
			<div class="mx-auto mt-20 max-w-md text-center">
				<h1 class="text-xl font-semibold">Belum terhubung ke perusahaan</h1>
				<p class="mt-2 text-slate-600">Hubungi admin agar akun Anda ditambahkan ke perusahaan.</p>
			</div>
		{/if}
	</main>
</div>
```

`app/src/routes/(app)/dashboard/+page.svelte` (placeholder):
```svelte
<h1 class="text-2xl font-semibold">Dashboard</h1>
```

- [ ] **Step 7: Verifikasi manual login**

Run: `cd app && bun run test && bun run dev`
Lalu buka `http://localhost:5173`. Expected: redirect ke `/login`; login dengan `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` dari `app/.env` → `/dashboard` dengan sidebar lengkap dan "PT Demo Perusahaan" di switcher; password salah → "Email atau password salah"; tombol Keluar → kembali ke `/login`. Hentikan dev server.

- [ ] **Step 8: Commit**

```bash
git add app/src app/tests
git commit -m "feat(app): auth hooks, login/logout, app shell with role-based nav and company switcher

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Rule engine — normalisasi deskripsi + pencocokan rule

**Files:**
- Create: `app/src/lib/server/categorize/normalize.ts`, `app/src/lib/server/categorize/rules.ts`
- Modify: `app/tests/integration/factory.ts` (tambah `makeUpload`)
- Test: `app/tests/unit/normalize.test.ts`, `app/tests/unit/rules.test.ts`, `app/tests/integration/rules.test.ts`

**Interfaces:**
- Produces: `normalizeDescription(description: string): string`.
- Produces: `type Direction = 'DB' | 'CR'`, `directionOf(t: { debit: string }): Direction`, `normalizeKeyword(raw: string | null | undefined): string | null` (trim, uppercase, spasi tunggal; < 3 karakter → null), `RuleLike`, `compareRules(a, b): number`, `pickRule(rules: RuleLike[], description: string, direction: Direction): RuleLike | null`, `loadRules(ex, companyId): Promise<RuleLike[]>` (hanya rule ke akun aktif), `applyRulesToPending(ex, companyId, uploadId?): Promise<number>`, `upsertUserRule(ex, companyId, keyword, accountId, direction): Promise<void>`.
- Produces (test): `makeUpload(companyId, userId | null, txns, opts?) → { uploadId, txnIds }`.

- [ ] **Step 1: Test unit yang gagal**

`app/tests/unit/normalize.test.ts`:
```ts
import { expect, test } from 'bun:test';
import { normalizeDescription } from '../../src/lib/server/categorize/normalize';

test('drops tokens containing digits and uppercases', () => {
	expect(normalizeDescription('TRSF E-BANKING DB 3108/FTSCY/WS95051 12642000.00 Payroll August 26 BUDI SANTOSO')).toBe(
		'TRSF E-BANKING DB PAYROLL AUGUST BUDI SANTOSO'
	);
	expect(normalizeDescription('BIAYA ADM 0998')).toBe('BIAYA ADM');
	expect(normalizeDescription('BYR VIA E-BANKING 18/08 95051 PENERIMAAN NEGARA 042399044680029')).toBe(
		'BYR VIA E-BANKING PENERIMAAN NEGARA'
	);
});

test('collapses whitespace and handles empty result', () => {
	expect(normalizeDescription('  bunga   ')).toBe('BUNGA');
	expect(normalizeDescription('12345 67/89')).toBe('');
});
```

`app/tests/unit/rules.test.ts`:
```ts
import { expect, test } from 'bun:test';
import { directionOf, normalizeKeyword, pickRule, type RuleLike } from '../../src/lib/server/categorize/rules';

const rule = (p: Partial<RuleLike> & { keywordPattern: string }): RuleLike => ({
	id: p.keywordPattern,
	accountId: `acc-${p.keywordPattern}`,
	priority: 0,
	source: 'SYSTEM',
	direction: null,
	...p
});

test('USER beats SYSTEM, then priority, then longer keyword', () => {
	const rules = [
		rule({ keywordPattern: 'PLN' }),
		rule({ keywordPattern: 'PLN PASCABAYAR' }),
		rule({ keywordPattern: 'BYR', source: 'USER', priority: 100 })
	];
	expect(pickRule(rules, 'BYR VIA E-BANKING PLN PASCABAYAR', 'DB')?.keywordPattern).toBe('BYR');
	expect(pickRule(rules.slice(0, 2), 'BYR VIA E-BANKING PLN PASCABAYAR', 'DB')?.keywordPattern).toBe('PLN PASCABAYAR');
	const prio = [rule({ keywordPattern: 'PLN PASCABAYAR' }), rule({ keywordPattern: 'PLN', priority: 5 })];
	expect(pickRule(prio, 'PLN PASCABAYAR', 'DB')?.keywordPattern).toBe('PLN');
});

test('direction filters rules; null direction matches both', () => {
	const rules = [rule({ keywordPattern: 'SHOPEE', direction: 'CR' })];
	expect(pickRule(rules, 'TRSF SHOPEE PAY', 'CR')).not.toBeNull();
	expect(pickRule(rules, 'TRSF SHOPEE PAY', 'DB')).toBeNull();
	expect(pickRule([rule({ keywordPattern: 'SHOPEE' })], 'SHOPEE', 'DB')).not.toBeNull();
});

test('keyword matched literally, case-insensitive, wildcards not special', () => {
	expect(pickRule([rule({ keywordPattern: 'DISKON 50%' })], 'DISKON 500 RIBU', 'DB')).toBeNull();
	expect(pickRule([rule({ keywordPattern: 'DISKON 50%' })], 'promo diskon 50% juli', 'DB')).not.toBeNull();
	expect(pickRule([rule({ keywordPattern: 'A_B' })], 'AXB', 'DB')).toBeNull();
});

test('normalizeKeyword and directionOf', () => {
	expect(normalizeKeyword('  payroll   bulanan ')).toBe('PAYROLL BULANAN');
	expect(normalizeKeyword('ab')).toBeNull();
	expect(normalizeKeyword(null)).toBeNull();
	expect(directionOf({ debit: '30000.00' })).toBe('DB');
	expect(directionOf({ debit: '0.00' })).toBe('CR');
});
```

Run: `cd app && bun run test:unit` → Expected: FAIL (module tidak ditemukan).

- [ ] **Step 2: Implementasi normalize & pickRule**

`app/src/lib/server/categorize/normalize.ts`:
```ts
/**
 * Kunci pengelompokan deskripsi transaksi: uppercase, buang token yang mengandung angka
 * (tanggal, nomor referensi, nominal, kode cabang), buang tanda baca, rapikan spasi.
 */
export function normalizeDescription(description: string): string {
	return description
		.toUpperCase()
		.split(/\s+/)
		.filter((tok) => tok.length > 0 && !/\d/.test(tok))
		.map((tok) => tok.replace(/[^A-Z&\-.']/g, ''))
		.filter((tok) => tok.length > 0 && tok !== '-')
		.join(' ');
}
```

`app/src/lib/server/categorize/rules.ts`:
```ts
import { and, eq, inArray } from 'drizzle-orm';
import { D } from '../../money';
import type { Executor } from '../db';
import { accounts, categoryRules, transactions } from '../db/schema';

export type Direction = 'DB' | 'CR';

export interface RuleLike {
	id: string;
	keywordPattern: string;
	accountId: string;
	priority: number;
	source: 'SYSTEM' | 'USER';
	direction: Direction | null;
}

export function directionOf(t: { debit: string }): Direction {
	return D(t.debit).gt(0) ? 'DB' : 'CR';
}

export function normalizeKeyword(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const k = raw.trim().toUpperCase().replace(/\s+/g, ' ');
	return k.length >= 3 ? k : null;
}

const SOURCE_RANK = { USER: 1, SYSTEM: 0 } as const;

/** Negatif bila `a` lebih diutamakan dari `b`: USER > SYSTEM, priority tinggi, keyword lebih panjang. */
export function compareRules(a: RuleLike, b: RuleLike): number {
	return (
		SOURCE_RANK[b.source] - SOURCE_RANK[a.source] ||
		b.priority - a.priority ||
		b.keywordPattern.length - a.keywordPattern.length
	);
}

export function pickRule(rules: RuleLike[], description: string, direction: Direction): RuleLike | null {
	const text = description.toUpperCase();
	let best: RuleLike | null = null;
	for (const r of rules) {
		if (r.direction && r.direction !== direction) continue;
		if (!text.includes(r.keywordPattern.toUpperCase())) continue; // literal, bukan LIKE
		if (!best || compareRules(r, best) < 0) best = r;
	}
	return best;
}

export async function loadRules(ex: Executor, companyId: string): Promise<RuleLike[]> {
	return ex
		.select({
			id: categoryRules.id,
			keywordPattern: categoryRules.keywordPattern,
			accountId: categoryRules.accountId,
			priority: categoryRules.priority,
			source: categoryRules.source,
			direction: categoryRules.direction
		})
		.from(categoryRules)
		.innerJoin(accounts, eq(accounts.id, categoryRules.accountId))
		.where(and(eq(categoryRules.companyId, companyId), eq(accounts.isActive, true)));
}

/** Terapkan rule ke transaksi yang belum confirmed; yang cocok langsung confirmed (source RULE). */
export async function applyRulesToPending(ex: Executor, companyId: string, uploadId?: string): Promise<number> {
	const rules = await loadRules(ex, companyId);
	if (rules.length === 0) return 0;
	const conditions = [eq(transactions.companyId, companyId), eq(transactions.isConfirmed, false)];
	if (uploadId) conditions.push(eq(transactions.uploadId, uploadId));
	const pending = await ex
		.select({ id: transactions.id, description: transactions.description, debit: transactions.debit })
		.from(transactions)
		.where(and(...conditions));

	const idsByAccount = new Map<string, string[]>();
	for (const t of pending) {
		const rule = pickRule(rules, t.description, directionOf(t));
		if (!rule) continue;
		const ids = idsByAccount.get(rule.accountId) ?? [];
		ids.push(t.id);
		idsByAccount.set(rule.accountId, ids);
	}

	let count = 0;
	const now = new Date();
	for (const [accountId, ids] of idsByAccount) {
		await ex
			.update(transactions)
			.set({ accountId, source: 'RULE', aiConfidence: '1.000', isConfirmed: true, confirmedAt: now, confirmedBy: null })
			.where(inArray(transactions.id, ids));
		count += ids.length;
	}
	return count;
}

export async function upsertUserRule(
	ex: Executor,
	companyId: string,
	keyword: string,
	accountId: string,
	direction: Direction
): Promise<void> {
	await ex
		.insert(categoryRules)
		.values({ companyId, keywordPattern: keyword, accountId, direction, priority: 100, source: 'USER' })
		.onConflictDoUpdate({
			target: [categoryRules.companyId, categoryRules.keywordPattern, categoryRules.direction],
			set: { accountId, priority: 100, source: 'USER' }
		});
}
```

Run: `cd app && bun run test:unit` → Expected: PASS.

- [ ] **Step 3: Factory `makeUpload` + test integration yang gagal**

Tambahkan ke `app/tests/integration/factory.ts`:
```ts
import { statementUploads, transactions } from '../../src/lib/server/db/schema';
import { normalizeDescription } from '../../src/lib/server/categorize/normalize';

export async function makeUpload(
	companyId: string,
	userId: string | null,
	txns: Array<{ date?: string; description: string; debit?: string; credit?: string }>,
	opts: {
		accountNo?: string;
		periodStart?: string;
		periodEnd?: string;
		status?: 'processing' | 'review' | 'done' | 'error';
	} = {}
): Promise<{ uploadId: string; txnIds: string[] }> {
	const [u] = await db
		.insert(statementUploads)
		.values({
			companyId,
			uploadedBy: userId,
			filename: 'uji.pdf',
			accountNo: opts.accountNo ?? '1234567890',
			periodStart: opts.periodStart ?? '2026-08-01',
			periodEnd: opts.periodEnd ?? '2026-08-31',
			openingBalance: '0',
			closingBalance: '0',
			status: opts.status ?? 'processing'
		})
		.returning({ id: statementUploads.id });
	const txnIds: string[] = [];
	for (const [i, t] of txns.entries()) {
		const [row] = await db
			.insert(transactions)
			.values({
				uploadId: u.id,
				companyId,
				lineNo: i + 1,
				txnDate: t.date ?? '2026-08-15',
				description: t.description,
				groupKey: normalizeDescription(t.description),
				debit: t.debit ?? '0',
				credit: t.credit ?? '0'
			})
			.returning({ id: transactions.id });
		txnIds.push(row.id);
	}
	return { uploadId: u.id, txnIds };
}
```
(Gabungkan import baru dengan import yang sudah ada di bagian atas file.)

`app/tests/integration/rules.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, categoryRules, transactions } from '../../src/lib/server/db/schema';
import { applyRulesToPending, upsertUserRule } from '../../src/lib/server/categorize/rules';
import { accountIdByCode, makeCompany, makeUpload } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const txn = (id: string) => db.query.transactions.findFirst({ where: eq(transactions.id, id) });

test('confirms matching transactions with correct direction only', async () => {
	const { companyId } = await makeCompany();
	const { uploadId, txnIds } = await makeUpload(companyId, null, [
		{ description: 'BIAYA ADM 0998', debit: '30000' },
		{ description: 'TRSF TOKOPEDIA SETTLEMENT', credit: '500000' },
		{ description: 'BELANJA TOKOPEDIA ATK', debit: '75000' },
		{ description: 'TRANSFER DARI PELANGGAN', credit: '1000000' }
	]);
	expect(await applyRulesToPending(db, companyId, uploadId)).toBe(2);

	const adm = await txn(txnIds[0]);
	expect(adm?.isConfirmed).toBe(true);
	expect(adm?.source).toBe('RULE');
	expect(adm?.aiConfidence).toBe('1.000');
	expect(adm?.accountId).toBe(await accountIdByCode(companyId, '5-2010'));
	expect((await txn(txnIds[1]))?.accountId).toBe(await accountIdByCode(companyId, '4-1002'));
	expect((await txn(txnIds[2]))?.isConfirmed).toBe(false); // TOKOPEDIA rule hanya untuk CR
	expect((await txn(txnIds[3]))?.isConfirmed).toBe(false);
});

test('rules pointing to inactive accounts are ignored', async () => {
	const { companyId } = await makeCompany();
	await db.update(accounts).set({ isActive: false }).where(eq(accounts.id, await accountIdByCode(companyId, '5-2010')));
	const { uploadId } = await makeUpload(companyId, null, [{ description: 'BIAYA ADM', debit: '30000' }]);
	expect(await applyRulesToPending(db, companyId, uploadId)).toBe(0);
});

test('upsertUserRule creates then overrides a USER rule', async () => {
	const { companyId } = await makeCompany();
	const gaji = await accountIdByCode(companyId, '5-2001');
	const sewa = await accountIdByCode(companyId, '5-2003');
	await upsertUserRule(db, companyId, 'PAYROLL', gaji, 'DB');
	await upsertUserRule(db, companyId, 'PAYROLL', sewa, 'DB');
	const rows = await db.select().from(categoryRules).where(eq(categoryRules.keywordPattern, 'PAYROLL'));
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({ accountId: sewa, source: 'USER', priority: 100, direction: 'DB' });
});
```

Run: `cd app && bun test tests/integration/rules.test.ts` → Expected: PASS (implementasi sudah ada dari Step 2; bila gagal, perbaiki implementasi, bukan test).

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/server/categorize app/tests
git commit -m "feat(app): description normalizer and directional rule engine

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Client Ollama (saran akun berbasis AI)

**Files:**
- Create: `app/src/lib/server/categorize/ollama.ts`
- Test: `app/tests/unit/ollama.test.ts`

**Interfaces:**
- Consumes: `Direction`, `normalizeKeyword` (Task 8).
- Produces: `AiAccount { code; name; type }`, `AiGroup { groupId: string; sample: string; direction: Direction; amount: string }`, `AiSuggestion { groupId; accountCode; confidence: number; reason: string; keyword: string | null }`, `BatchResult { ok: boolean; suggestions: AiSuggestion[] }`, `class OllamaUnavailableError`, `buildPrompt(groups, accounts): string`, `suggestAccounts(groups, accounts, opts: { url: string; model: string; fetch?: typeof fetch; timeoutMs?: number }): Promise<BatchResult>`.
- Kontrak: error jaringan/timeout/HTTP non-2xx → throw `OllamaUnavailableError` (tanpa retry). JSON tidak valid, atau semua `account_code` tidak dikenal → retry sekali; gagal lagi → `{ ok: false, suggestions: [] }`.

- [ ] **Step 1: Test yang gagal**

`app/tests/unit/ollama.test.ts`:
```ts
import { expect, test } from 'bun:test';
import { OllamaUnavailableError, suggestAccounts, type AiAccount, type AiGroup } from '../../src/lib/server/categorize/ollama';

const accounts: AiAccount[] = [
	{ code: '5-2010', name: 'Beban Administrasi Bank', type: 'EXPENSE' },
	{ code: '4-1001', name: 'Pendapatan Jasa', type: 'REVENUE' }
];
const groups: AiGroup[] = [
	{ groupId: '1', sample: 'BIAYA TRANSFER', direction: 'DB', amount: '6500.00' },
	{ groupId: '2', sample: 'TRSF DARI PELANGGAN', direction: 'CR', amount: '2500000.00' }
];

type Reply = string | Error | Response;
function fakeFetch(replies: Reply[]) {
	const calls: Array<{ url: string; body: any }> = [];
	const fn = (async (url: string, init: RequestInit) => {
		calls.push({ url, body: JSON.parse(String(init.body)) });
		const r = replies.shift();
		if (r instanceof Error) throw r;
		if (r instanceof Response) return r;
		return new Response(JSON.stringify({ message: { content: r } }), { status: 200 });
	}) as unknown as typeof fetch;
	return { fn, calls };
}
const opts = (f: typeof fetch) => ({ url: 'http://ollama:11434', model: 'qwen2.5:7b', fetch: f });

test('sends JSON-mode chat request and maps valid suggestions', async () => {
	const content = JSON.stringify({
		results: [
			{ group_id: '1', account_code: '5-2010', confidence: 0.92, reason: 'biaya bank', keyword: 'biaya transfer' },
			{ group_id: 2, account_code: '4-1001', confidence: '1.5', reason: 'pelanggan', keyword: 'x' }
		]
	});
	const { fn, calls } = fakeFetch([content]);
	const res = await suggestAccounts(groups, accounts, opts(fn));
	expect(calls[0].url).toBe('http://ollama:11434/api/chat');
	expect(calls[0].body).toMatchObject({ model: 'qwen2.5:7b', stream: false, format: 'json', options: { temperature: 0 } });
	expect(calls[0].body.messages[1].content).toContain('5-2010 | Beban Administrasi Bank | EXPENSE');
	expect(res.ok).toBe(true);
	expect(res.suggestions).toEqual([
		{ groupId: '1', accountCode: '5-2010', confidence: 0.92, reason: 'biaya bank', keyword: 'BIAYA TRANSFER' },
		{ groupId: '2', accountCode: '4-1001', confidence: 1, reason: 'pelanggan', keyword: null }
	]);
});

test('drops unknown codes and unknown groups', async () => {
	const content = JSON.stringify({
		results: [
			{ group_id: '1', account_code: '9-9999', confidence: 0.9, reason: '' },
			{ group_id: '7', account_code: '5-2010', confidence: 0.9, reason: '' },
			{ group_id: '2', account_code: '4-1001', confidence: 0.4, reason: 'ragu' }
		]
	});
	const res = await suggestAccounts(groups, accounts, opts(fakeFetch([content]).fn));
	expect(res.suggestions.map((s) => s.groupId)).toEqual(['2']);
});

test('retries once on invalid JSON, then gives up with ok=false', async () => {
	const good = JSON.stringify({ results: [{ group_id: '1', account_code: '5-2010', confidence: 0.9, reason: 'ok' }] });
	const first = fakeFetch(['bukan json', good]);
	const res1 = await suggestAccounts(groups, accounts, opts(first.fn));
	expect(first.calls).toHaveLength(2);
	expect(res1.ok).toBe(true);

	const second = fakeFetch(['bukan json', '{"results": "salah"}']);
	const res2 = await suggestAccounts(groups, accounts, opts(second.fn));
	expect(res2).toEqual({ ok: false, suggestions: [] });
});

test('retries when every account code is unknown', async () => {
	const bad = JSON.stringify({ results: [{ group_id: '1', account_code: 'X', confidence: 0.9, reason: '' }] });
	const { fn, calls } = fakeFetch([bad, bad]);
	expect(await suggestAccounts(groups, accounts, opts(fn))).toEqual({ ok: false, suggestions: [] });
	expect(calls).toHaveLength(2);
});

test('network error or non-2xx throws OllamaUnavailableError', async () => {
	await expect(suggestAccounts(groups, accounts, opts(fakeFetch([new TypeError('ECONNREFUSED')]).fn))).rejects.toBeInstanceOf(
		OllamaUnavailableError
	);
	await expect(
		suggestAccounts(groups, accounts, opts(fakeFetch([new Response('model not found', { status: 404 })]).fn))
	).rejects.toBeInstanceOf(OllamaUnavailableError);
});
```

Run: `cd app && bun run test:unit` → Expected: FAIL (module tidak ditemukan).

- [ ] **Step 2: Implementasi**

`app/src/lib/server/categorize/ollama.ts`:
```ts
import { z } from 'zod';
import { normalizeKeyword, type Direction } from './rules';

export interface AiAccount {
	code: string;
	name: string;
	type: string;
}
export interface AiGroup {
	groupId: string;
	sample: string;
	direction: Direction;
	amount: string;
}
export interface AiSuggestion {
	groupId: string;
	accountCode: string;
	confidence: number;
	reason: string;
	keyword: string | null;
}
export interface BatchResult {
	ok: boolean;
	suggestions: AiSuggestion[];
}
export interface OllamaOptions {
	url: string;
	model: string;
	fetch?: typeof fetch;
	timeoutMs?: number;
}

export class OllamaUnavailableError extends Error {}

const SYSTEM_PROMPT =
	'Anda adalah asisten akuntan Indonesia. Tugas Anda memilih akun Chart of Accounts yang paling tepat ' +
	'untuk setiap mutasi rekening bank perusahaan. Jawab HANYA dengan JSON yang valid.';

const ResponseSchema = z.object({
	results: z.array(
		z.object({
			group_id: z.coerce.string(),
			account_code: z.coerce.string(),
			confidence: z.coerce.number(),
			reason: z.string().optional().default(''),
			keyword: z.string().nullish()
		})
	)
});

export function buildPrompt(groups: AiGroup[], accounts: AiAccount[]): string {
	const accountList = accounts.map((a) => `${a.code} | ${a.name} | ${a.type}`).join('\n');
	const mutations = JSON.stringify(
		groups.map((g) => ({ group_id: g.groupId, keterangan: g.sample, arah: g.direction, nominal: g.amount }))
	);
	return [
		'Daftar akun (kode | nama | tipe):',
		accountList,
		'',
		'Mutasi rekening (arah DB = uang keluar dari rekening, CR = uang masuk ke rekening):',
		mutations,
		'',
		'Untuk setiap mutasi, kembalikan JSON dengan bentuk persis:',
		'{"results":[{"group_id":"1","account_code":"5-2010","confidence":0.9,"reason":"alasan singkat","keyword":"kata kunci khas"}]}',
		'Aturan:',
		'- account_code WAJIB salah satu kode pada daftar akun.',
		'- confidence 0 sampai 1; beri nilai rendah bila ragu.',
		'- keyword: potongan teks pendek dari keterangan yang khas untuk jenis transaksi ini (bukan nama orang, bukan angka), dipakai sebagai rule otomatis.'
	].join('\n');
}

function clamp(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.min(1, Math.max(0, n));
}

function parseContent(content: unknown) {
	if (typeof content !== 'string') return null;
	try {
		const r = ResponseSchema.safeParse(JSON.parse(content));
		return r.success ? r.data : null;
	} catch {
		return null;
	}
}

export async function suggestAccounts(
	groups: AiGroup[],
	accounts: AiAccount[],
	opts: OllamaOptions
): Promise<BatchResult> {
	const doFetch = opts.fetch ?? fetch;
	const validCodes = new Set(accounts.map((a) => a.code));
	const groupIds = new Set(groups.map((g) => g.groupId));
	const body = JSON.stringify({
		model: opts.model,
		stream: false,
		format: 'json',
		options: { temperature: 0 },
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: buildPrompt(groups, accounts) }
		]
	});

	for (let attempt = 0; attempt < 2; attempt++) {
		let res: Response;
		try {
			res = await doFetch(`${opts.url}/api/chat`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body,
				signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000)
			});
		} catch (e) {
			throw new OllamaUnavailableError(`Ollama tidak dapat dihubungi: ${String(e)}`);
		}
		if (!res.ok) throw new OllamaUnavailableError(`Ollama membalas HTTP ${res.status}`);

		const payload = (await res.json().catch(() => null)) as { message?: { content?: unknown } } | null;
		const parsed = parseContent(payload?.message?.content);
		if (!parsed) continue;

		const suggestions = parsed.results
			.filter((r) => groupIds.has(r.group_id) && validCodes.has(r.account_code))
			.map((r) => ({
				groupId: r.group_id,
				accountCode: r.account_code,
				confidence: clamp(r.confidence),
				reason: r.reason,
				keyword: normalizeKeyword(r.keyword)
			}));
		if (parsed.results.length > 0 && suggestions.length === 0) continue;
		return { ok: true, suggestions };
	}
	return { ok: false, suggestions: [] };
}
```

- [ ] **Step 3: Jalankan test**

Run: `cd app && bun run test:unit`
Expected: PASS. (Catatan: `normalizeKeyword('x')` → `null`, sesuai ekspektasi test pertama.)

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/server/categorize/ollama.ts app/tests/unit/ollama.test.ts
git commit -m "feat(app): Ollama client with JSON-mode prompt, validation and single retry

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Akun leaf, saldo buku, baris jurnal, dan Saldo Awal (service + API)

**Files:**
- Create: `app/src/lib/server/accounts/queries.ts`, `app/src/lib/server/ledger/balance.ts`, `app/src/lib/server/journal/lines.ts`, `app/src/lib/server/journal/opening.ts`
- Create: `app/src/routes/api/opening-balance/+server.ts`
- Test: `app/tests/unit/journal-lines.test.ts`, `app/tests/integration/opening.test.ts`

**Interfaces:**
- Produces (`accounts/queries.ts`): `LeafAccount { id; code; name; type; normalBal }`, `AccountRow { id; code; name; type; normalBal; parentId; cashFlowCat; isActive; isLeaf }`, `listLeafAccounts(ex, companyId): Promise<LeafAccount[]>`, `assertLeafAccount(ex, companyId, accountId): Promise<LeafAccount>` (422 `invalid_account`), `listAccounts(ex, companyId): Promise<AccountRow[]>`.
- Produces (`ledger/balance.ts`): `naturalBalanceAtStartOf(ex, companyId, accountId, date): Promise<string>` (Σdebit−Σkredit untuk entry sebelum `date` + OPENING bertanggal `date`), `signedForNormal(natural, normalBal): string`, `balanceAtStartOf(ex, companyId, accountId, date): Promise<string>` (sudah mengikuti normal balance akun).
- Produces (`journal/lines.ts`): `JournalLineInput { accountId; debit: string; credit: string }`, `assertBalanced(lines): void` (422 `unbalanced`/`invalid_line`), `buildTransactionLines(t: { debit; credit; accountId }, bankAccountId): JournalLineInput[]`.
- Produces (`journal/opening.ts`): `OpeningInput` (zod), `getOpening(companyId): Promise<{ date: string; lines: JournalLineInput[] } | null>`, `saveOpening(companyId, userId, input): Promise<{ id: string }>`.
- Produces: `GET /api/opening-balance` (viewer) → `{ opening }`; `PUT /api/opening-balance` (accountant) → `{ id }`.

- [ ] **Step 1: Test unit baris jurnal yang gagal**

`app/tests/unit/journal-lines.test.ts`:
```ts
import { expect, test } from 'bun:test';
import { assertBalanced, buildTransactionLines } from '../../src/lib/server/journal/lines';

test('money out: debit category, credit bank', () => {
	expect(buildTransactionLines({ debit: '30000', credit: '0', accountId: 'beban' }, 'bank')).toEqual([
		{ accountId: 'beban', debit: '30000.00', credit: '0.00' },
		{ accountId: 'bank', debit: '0.00', credit: '30000.00' }
	]);
});

test('money in: debit bank, credit category', () => {
	expect(buildTransactionLines({ debit: '0.00', credit: '2500000.5', accountId: 'pendapatan' }, 'bank')).toEqual([
		{ accountId: 'bank', debit: '2500000.50', credit: '0.00' },
		{ accountId: 'pendapatan', debit: '0.00', credit: '2500000.50' }
	]);
});

test('assertBalanced accepts balanced and rejects invalid journals', () => {
	expect(() =>
		assertBalanced([
			{ accountId: 'a', debit: '100.10', credit: '0' },
			{ accountId: 'b', debit: '0', credit: '50.05' },
			{ accountId: 'c', debit: '0', credit: '50.05' }
		])
	).not.toThrow();
	const err = (fn: () => void) => {
		try {
			fn();
		} catch (e) {
			return (e as { code: string }).code;
		}
		return null;
	};
	expect(err(() => assertBalanced([{ accountId: 'a', debit: '1', credit: '0' }]))).toBe('unbalanced');
	expect(err(() => assertBalanced([{ accountId: 'a', debit: '1', credit: '0' }, { accountId: 'b', debit: '0', credit: '2' }]))).toBe('unbalanced');
	expect(err(() => assertBalanced([{ accountId: 'a', debit: '1', credit: '1' }, { accountId: 'b', debit: '0', credit: '0' }]))).toBe('invalid_line');
	expect(err(() => assertBalanced([{ accountId: 'a', debit: '-1', credit: '0' }, { accountId: 'b', debit: '0', credit: '-1' }]))).toBe('invalid_line');
});
```
Run: `cd app && bun run test:unit` → Expected: FAIL.

- [ ] **Step 2: Implementasi lines, accounts queries, balance**

`app/src/lib/server/journal/lines.ts`:
```ts
import { D, sumMoney, toMoney } from '../../money';
import { ApiError } from '../api';

export interface JournalLineInput {
	accountId: string;
	debit: string;
	credit: string;
}

export function assertBalanced(lines: JournalLineInput[]): void {
	if (lines.length < 2) throw new ApiError(422, 'unbalanced', 'Jurnal minimal terdiri dari dua baris');
	for (const l of lines) {
		const d = D(l.debit);
		const c = D(l.credit);
		if (d.isNeg() || c.isNeg() || d.isZero() === c.isZero()) {
			throw new ApiError(422, 'invalid_line', 'Setiap baris jurnal harus berisi debit atau kredit saja, tidak negatif');
		}
	}
	const totalDebit = sumMoney(lines.map((l) => l.debit));
	const totalCredit = sumMoney(lines.map((l) => l.credit));
	if (!totalDebit.eq(totalCredit)) {
		throw new ApiError(
			422,
			'unbalanced',
			`Jurnal tidak balance: debit ${toMoney(totalDebit)} ≠ kredit ${toMoney(totalCredit)}`
		);
	}
}

/** Uang keluar (DB): Dr akun kategori / Cr bank. Uang masuk (CR): Dr bank / Cr akun kategori. */
export function buildTransactionLines(
	t: { debit: string; credit: string; accountId: string },
	bankAccountId: string
): JournalLineInput[] {
	if (D(t.debit).gt(0)) {
		const amount = toMoney(t.debit);
		return [
			{ accountId: t.accountId, debit: amount, credit: '0.00' },
			{ accountId: bankAccountId, debit: '0.00', credit: amount }
		];
	}
	const amount = toMoney(t.credit);
	return [
		{ accountId: bankAccountId, debit: amount, credit: '0.00' },
		{ accountId: t.accountId, debit: '0.00', credit: amount }
	];
}
```

`app/src/lib/server/accounts/queries.ts`:
```ts
import { and, asc, eq, sql } from 'drizzle-orm';
import { ApiError } from '../api';
import type { Executor } from '../db';
import { accounts } from '../db/schema';

export interface LeafAccount {
	id: string;
	code: string;
	name: string;
	type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
	normalBal: 'DEBIT' | 'CREDIT';
}

export interface AccountRow extends LeafAccount {
	parentId: string | null;
	cashFlowCat: 'OPERATING' | 'INVESTING' | 'FINANCING' | null;
	isActive: boolean;
	isLeaf: boolean;
}

const noChildren = sql`not exists (select 1 from accounts c where c.parent_id = ${accounts.id})`;

const leafColumns = {
	id: accounts.id,
	code: accounts.code,
	name: accounts.name,
	type: accounts.type,
	normalBal: accounts.normalBal
};

export async function listLeafAccounts(ex: Executor, companyId: string): Promise<LeafAccount[]> {
	return ex
		.select(leafColumns)
		.from(accounts)
		.where(and(eq(accounts.companyId, companyId), eq(accounts.isActive, true), noChildren))
		.orderBy(asc(accounts.code));
}

export async function assertLeafAccount(ex: Executor, companyId: string, accountId: string): Promise<LeafAccount> {
	const [row] = await ex
		.select(leafColumns)
		.from(accounts)
		.where(and(eq(accounts.id, accountId), eq(accounts.companyId, companyId), eq(accounts.isActive, true), noChildren))
		.limit(1);
	if (!row) throw new ApiError(422, 'invalid_account', 'Akun tidak valid, tidak aktif, atau bukan akun detail (leaf)');
	return row;
}

export async function listAccounts(ex: Executor, companyId: string): Promise<AccountRow[]> {
	return ex
		.select({
			...leafColumns,
			parentId: accounts.parentId,
			cashFlowCat: accounts.cashFlowCat,
			isActive: accounts.isActive,
			isLeaf: sql<boolean>`${noChildren}`
		})
		.from(accounts)
		.where(eq(accounts.companyId, companyId))
		.orderBy(asc(accounts.code));
}
```

`app/src/lib/server/ledger/balance.ts`:
```ts
import { and, eq, lt, or, sql } from 'drizzle-orm';
import { D, toMoney, type MoneyValue } from '../../money';
import type { Executor } from '../db';
import { accounts, journalEntries, journalLines } from '../db/schema';

/** Σdebit − Σkredit akun pada awal hari `date` (entry sebelum `date`, plus jurnal OPENING bertanggal `date`). */
export async function naturalBalanceAtStartOf(
	ex: Executor,
	companyId: string,
	accountId: string,
	date: string
): Promise<string> {
	const [row] = await ex
		.select({ total: sql<string>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)` })
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.where(
			and(
				eq(journalEntries.companyId, companyId),
				eq(journalLines.accountId, accountId),
				or(
					lt(journalEntries.entryDate, date),
					and(eq(journalEntries.type, 'OPENING'), eq(journalEntries.entryDate, date))
				)
			)
		);
	return toMoney(row.total);
}

export function signedForNormal(natural: MoneyValue, normalBal: 'DEBIT' | 'CREDIT'): string {
	return toMoney(normalBal === 'DEBIT' ? D(natural) : D(natural).neg());
}

export async function balanceAtStartOf(ex: Executor, companyId: string, accountId: string, date: string): Promise<string> {
	const account = await ex.query.accounts.findFirst({ where: eq(accounts.id, accountId) });
	const natural = await naturalBalanceAtStartOf(ex, companyId, accountId, date);
	return signedForNormal(natural, account?.normalBal ?? 'DEBIT');
}
```

Run: `cd app && bun run test:unit` → Expected: PASS.

- [ ] **Step 3: Test integration saldo awal yang gagal**

`app/tests/integration/opening.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { journalEntries, journalLines } from '../../src/lib/server/db/schema';
import { getOpening, saveOpening } from '../../src/lib/server/journal/opening';
import { balanceAtStartOf } from '../../src/lib/server/ledger/balance';
import { GET, PUT } from '../../src/routes/api/opening-balance/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId, bankAccountId } = await makeCompany();
	const modal = await accountIdByCode(companyId, '3-1001');
	const u = await makeUser();
	return { companyId, bankAccountId, modal, u };
}

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('save, read back and replace the single OPENING entry', async () => {
	const { companyId, bankAccountId, modal, u } = await setup();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '1000000', credit: '0' },
			{ accountId: modal, debit: '0', credit: '1000000' },
			{ accountId: await accountIdByCode(companyId, '1-1001'), debit: '0', credit: '0' }
		]
	});
	const opening = await getOpening(companyId);
	expect(opening?.date).toBe('2026-08-01');
	expect(opening?.lines).toHaveLength(2); // baris nol dibuang

	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '2000000', credit: '0' },
			{ accountId: modal, debit: '0', credit: '2000000' }
		]
	});
	const entries = await db.select().from(journalEntries).where(eq(journalEntries.type, 'OPENING'));
	expect(entries).toHaveLength(1);
	expect(await db.select().from(journalLines)).toHaveLength(2);
	expect(await balanceAtStartOf(db, companyId, bankAccountId, '2026-08-01')).toBe('2000000.00');
	expect(await balanceAtStartOf(db, companyId, modal, '2026-08-01')).toBe('2000000.00');
});

test('rejects unbalanced, empty, non-leaf and foreign accounts', async () => {
	const { companyId, bankAccountId, modal, u } = await setup();
	const other = await makeCompany('PT Lain');
	const parent = await accountIdByCode(companyId, '1-1000');
	const base = { date: '2026-08-01' };
	expect(await codeOf(saveOpening(companyId, u.id, { ...base, lines: [{ accountId: bankAccountId, debit: '10', credit: '0' }, { accountId: modal, debit: '0', credit: '9' }] }))).toBe('unbalanced');
	expect(await codeOf(saveOpening(companyId, u.id, { ...base, lines: [] }))).toBe('empty_opening');
	expect(await codeOf(saveOpening(companyId, u.id, { ...base, lines: [{ accountId: parent, debit: '10', credit: '0' }, { accountId: modal, debit: '0', credit: '10' }] }))).toBe('invalid_account');
	expect(await codeOf(saveOpening(companyId, u.id, { ...base, lines: [{ accountId: other.bankAccountId, debit: '10', credit: '0' }, { accountId: modal, debit: '0', credit: '10' }] }))).toBe('invalid_account');
	expect(await getOpening(companyId)).toBeNull();
});

test('API: viewer can read, only accountant+ can write', async () => {
	const { companyId, bankAccountId, modal } = await setup();
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const accountant = await makeUser();
	await addMember(accountant.id, companyId, 'accountant');
	const body = { date: '2026-08-01', lines: [{ accountId: bankAccountId, debit: '5', credit: '0' }, { accountId: modal, debit: '0', credit: '5' }] };

	expect((await call(GET, fakeEvent({ ctx: await contextFor(viewer) }))).status).toBe(200);
	expect((await call(PUT, fakeEvent({ ctx: await contextFor(viewer), method: 'PUT', body }))).status).toBe(403);
	expect((await call(PUT, fakeEvent({ ctx: await contextFor(accountant), method: 'PUT', body }))).status).toBe(200);
	expect((await call(PUT, fakeEvent({ ctx: await contextFor(accountant), method: 'PUT', body: { date: 'x', lines: [] } }))).status).toBe(400);
});
```
Run: `cd app && bun test tests/integration/opening.test.ts` → Expected: FAIL (module tidak ditemukan).

- [ ] **Step 4: Implementasi opening service + API**

`app/src/lib/server/journal/opening.ts`:
```ts
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { isZero, toMoney } from '../../money';
import { assertLeafAccount } from '../accounts/queries';
import { ApiError } from '../api';
import { db } from '../db';
import { journalEntries, journalLines } from '../db/schema';
import { isoDate, moneyString } from '../validation';
import { assertBalanced, type JournalLineInput } from './lines';

export const OpeningInput = z.object({
	date: isoDate,
	lines: z.array(z.object({ accountId: z.uuid(), debit: moneyString, credit: moneyString }))
});
export type OpeningInput = z.infer<typeof OpeningInput>;

export async function getOpening(companyId: string): Promise<{ date: string; lines: JournalLineInput[] } | null> {
	const entry = await db.query.journalEntries.findFirst({
		where: and(eq(journalEntries.companyId, companyId), eq(journalEntries.type, 'OPENING'))
	});
	if (!entry) return null;
	const lines = await db
		.select({ accountId: journalLines.accountId, debit: journalLines.debit, credit: journalLines.credit })
		.from(journalLines)
		.where(eq(journalLines.journalId, entry.id))
		.orderBy(asc(journalLines.id));
	return { date: entry.entryDate, lines };
}

export async function saveOpening(companyId: string, userId: string, input: OpeningInput): Promise<{ id: string }> {
	const lines = input.lines
		.filter((l) => !isZero(l.debit) || !isZero(l.credit))
		.map((l) => ({ accountId: l.accountId, debit: toMoney(l.debit), credit: toMoney(l.credit) }));
	if (lines.length === 0) throw new ApiError(422, 'empty_opening', 'Isi minimal satu saldo akun');
	assertBalanced(lines);

	return db.transaction(async (tx) => {
		for (const l of lines) await assertLeafAccount(tx, companyId, l.accountId);
		await tx
			.delete(journalEntries)
			.where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.type, 'OPENING')));
		const [entry] = await tx
			.insert(journalEntries)
			.values({
				companyId,
				type: 'OPENING',
				entryDate: input.date,
				description: 'Saldo Awal',
				refNo: 'OPENING',
				createdBy: userId
			})
			.returning({ id: journalEntries.id });
		await tx.insert(journalLines).values(lines.map((l) => ({ journalId: entry.id, ...l })));
		return entry;
	});
}
```

`app/src/routes/api/opening-balance/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { getOpening, OpeningInput, saveOpening } from '$lib/server/journal/opening';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json({ opening: await getOpening(ctx.companyId) });
	});

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, OpeningInput);
		return json(await saveOpening(ctx.companyId, ctx.user.id, input));
	});
```

- [ ] **Step 5: Jalankan test**

Run: `cd app && bun run test`
Expected: semua PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/server/accounts app/src/lib/server/ledger app/src/lib/server/journal app/src/routes/api/opening-balance app/tests
git commit -m "feat(app): leaf account queries, book balances, journal line validation and opening balance

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Upload eStatement — client sidecar, pipeline kategorisasi, job runner, API

**Files:**
- Create: `app/src/lib/server/uploads/sidecar-client.ts`, `app/src/lib/server/uploads/status.ts`, `app/src/lib/server/uploads/service.ts`
- Create: `app/src/lib/server/categorize/pipeline.ts`, `app/src/lib/server/jobs.ts`
- Create: `app/src/lib/server/transactions/queries.ts`
- Create: `app/src/routes/api/uploads/+server.ts`, `app/src/routes/api/uploads/[id]/+server.ts`, `app/src/routes/api/uploads/[id]/categorize/+server.ts`
- Modify: `app/src/hooks.server.ts` (tambah hook `init`)
- Test: `app/tests/unit/sidecar-client.test.ts`, `app/tests/integration/pipeline.test.ts`, `app/tests/integration/uploads.test.ts`

**Interfaces:**
- Consumes: `normalizeDescription`, `applyRulesToPending`, `directionOf` (Task 8); `suggestAccounts`, `OllamaUnavailableError`, `AiGroup`, `AiAccount`, `BatchResult` (Task 9); `listLeafAccounts`, `balanceAtStartOf` (Task 10); `formatIdr`, `D` (Task 3).
- Produces (`uploads/sidecar-client.ts`): `ParsedTransaction`, `ParsedStatement` (field snake_case sesuai JSON sidecar), `parseWithSidecar(file: File, opts?: { url?: string; fetch?: typeof fetch }): Promise<ParsedStatement>` (503 `sidecar_unavailable`, 422 `pdf_not_bca` | `pdf_checksum_mismatch` | `pdf_unreadable`).
- Produces (`uploads/status.ts`): `settleUploadStatus(ex, uploadId): Promise<'review' | 'done'>`, `refreshReviewedUploads(ex, companyId): Promise<void>`, `markUploadError(ex, uploadId, message): Promise<void>`.
- Produces (`categorize/pipeline.ts`): `type SuggestFn = (groups: AiGroup[], accounts: AiAccount[]) => Promise<BatchResult>`, `runCategorization(uploadId: string, suggest: SuggestFn): Promise<void>`.
- Produces (`jobs.ts`): `configureJobs(opts: { suggest: SuggestFn }): void`, `enqueueCategorization(uploadId: string): void`, `jobsIdle(): Promise<void>`, `resumePendingJobs(): Promise<number>`.
- Produces (`uploads/service.ts`): `UploadDeps { parse; enqueue }`, `createUpload(input: { companyId; userId; file: File }, deps): Promise<{ id: string; balanceWarning: string | null }>`, `listUploads(companyId)`, `getUpload(companyId, uploadId)` (404 bila bukan miliknya), `deleteUpload(companyId, uploadId)`, `retryCategorization(companyId, uploadId, enqueue)`.
- Produces (`transactions/queries.ts`): `TransactionRow`, `listTransactions(companyId, filter: { uploadId?: string; pendingOnly?: boolean }): Promise<TransactionRow[]>`.
- Produces HTTP: `POST /api/uploads` (accountant, multipart `file`) → 201 `{ id, balanceWarning }`; `GET /api/uploads` (viewer) → `{ uploads }`; `GET /api/uploads/:id` (viewer) → `{ upload, transactions }`; `DELETE /api/uploads/:id` (admin) → `{ ok: true }`; `POST /api/uploads/:id/categorize` (accountant) → `{ ok: true }`.

- [ ] **Step 1: Test client sidecar yang gagal**

`app/tests/unit/sidecar-client.test.ts`:
```ts
import { expect, test } from 'bun:test';
import { parseWithSidecar } from '../../src/lib/server/uploads/sidecar-client';

const file = new File([new Uint8Array([37, 80, 68, 70])], 'st.pdf', { type: 'application/pdf' });
const fakeFetch = (res: Response | Error) =>
	(async () => {
		if (res instanceof Error) throw res;
		return res;
	}) as unknown as typeof fetch;

test('returns parsed statement on 200', async () => {
	const body = { account_no: '1', period_start: '2026-08-01', period_end: '2026-08-31', opening_balance: '0.00', closing_balance: '0.00', transactions: [] };
	const r = await parseWithSidecar(file, { url: 'http://sc', fetch: fakeFetch(Response.json(body)) });
	expect(r.account_no).toBe('1');
});

test('maps 422 reasons to friendly errors', async () => {
	await expect(
		parseWithSidecar(file, { url: 'http://sc', fetch: fakeFetch(Response.json({ reason: 'checksum_mismatch', detail: 'x' }, { status: 422 })) })
	).rejects.toMatchObject({ status: 422, code: 'pdf_checksum_mismatch' });
	await expect(
		parseWithSidecar(file, { url: 'http://sc', fetch: fakeFetch(Response.json({ reason: 'not_bca' }, { status: 422 })) })
	).rejects.toMatchObject({ status: 422, code: 'pdf_not_bca' });
});

test('network failure and 5xx become 503', async () => {
	await expect(parseWithSidecar(file, { url: 'http://sc', fetch: fakeFetch(new TypeError('refused')) })).rejects.toMatchObject({ status: 503 });
	await expect(parseWithSidecar(file, { url: 'http://sc', fetch: fakeFetch(new Response('x', { status: 500 })) })).rejects.toMatchObject({ status: 503 });
});
```
Run: `cd app && bun run test:unit` → Expected: FAIL.

- [ ] **Step 2: Implementasi client sidecar dan status**

`app/src/lib/server/uploads/sidecar-client.ts`:
```ts
import { ApiError } from '../api';
import { env } from '../env';

export interface ParsedTransaction {
	line_no: number;
	date: string;
	description: string;
	amount: string;
	direction: 'DB' | 'CR';
	balance: string | null;
}
export interface ParsedStatement {
	account_no: string;
	period_start: string;
	period_end: string;
	opening_balance: string;
	closing_balance: string;
	transactions: ParsedTransaction[];
}

const REASON_MESSAGES: Record<string, string> = {
	not_bca: 'File bukan eStatement BCA yang dikenali.',
	checksum_mismatch:
		'Total mutasi di PDF tidak cocok dengan ringkasan di bagian bawah. File mungkin rusak atau formatnya belum didukung.',
	unreadable: 'PDF tidak bisa dibaca.'
};

const unavailable = () =>
	new ApiError(503, 'sidecar_unavailable', 'Layanan parser PDF tidak tersedia. Coba lagi beberapa saat lagi.');

export async function parseWithSidecar(
	file: File,
	opts: { url?: string; fetch?: typeof fetch } = {}
): Promise<ParsedStatement> {
	const doFetch = opts.fetch ?? fetch;
	const form = new FormData();
	form.append('file', file, file.name);
	let res: Response;
	try {
		res = await doFetch(`${opts.url ?? env.SIDECAR_URL}/parse`, {
			method: 'POST',
			body: form,
			signal: AbortSignal.timeout(60_000)
		});
	} catch {
		throw unavailable();
	}
	if (res.status === 422) {
		const body = (await res.json().catch(() => ({}))) as { reason?: string; detail?: string };
		const reason = body.reason && REASON_MESSAGES[body.reason] ? body.reason : 'unreadable';
		throw new ApiError(422, `pdf_${reason}`, REASON_MESSAGES[reason], body.detail);
	}
	if (!res.ok) throw unavailable();
	return (await res.json()) as ParsedStatement;
}
```

`app/src/lib/server/uploads/status.ts`:
```ts
import { and, count, eq, sql } from 'drizzle-orm';
import type { Executor } from '../db';
import { statementUploads, transactions } from '../db/schema';

export async function settleUploadStatus(ex: Executor, uploadId: string): Promise<'review' | 'done'> {
	const [{ pending }] = await ex
		.select({ pending: count() })
		.from(transactions)
		.where(and(eq(transactions.uploadId, uploadId), eq(transactions.isConfirmed, false)));
	const status = pending > 0 ? 'review' : 'done';
	await ex.update(statementUploads).set({ status }).where(eq(statementUploads.id, uploadId));
	return status;
}

/** Upload berstatus review yang semua transaksinya sudah confirmed → done. */
export async function refreshReviewedUploads(ex: Executor, companyId: string): Promise<void> {
	await ex.execute(sql`
		update statement_uploads su set status = 'done'
		where su.company_id = ${companyId} and su.status = 'review'
		  and not exists (select 1 from transactions t where t.upload_id = su.id and t.is_confirmed = false)
	`);
}

export async function markUploadError(ex: Executor, uploadId: string, message: string): Promise<void> {
	await ex.update(statementUploads).set({ status: 'error', errorMessage: message }).where(eq(statementUploads.id, uploadId));
}
```
Run: `cd app && bun run test:unit` → Expected: PASS.

- [ ] **Step 3: Test pipeline yang gagal**

`app/tests/integration/pipeline.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { statementUploads, transactions } from '../../src/lib/server/db/schema';
import { runCategorization, type SuggestFn } from '../../src/lib/server/categorize/pipeline';
import { OllamaUnavailableError, type AiAccount, type AiGroup } from '../../src/lib/server/categorize/ollama';
import { configureJobs, enqueueCategorization, jobsIdle } from '../../src/lib/server/jobs';
import { accountIdByCode, makeCompany, makeUpload } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const upload = (id: string) => db.query.statementUploads.findFirst({ where: eq(statementUploads.id, id) });
const txns = (uploadId: string) =>
	db.select().from(transactions).where(eq(transactions.uploadId, uploadId)).orderBy(transactions.lineNo);

test('rules confirm, AI suggests per group, bank account hidden from AI', async () => {
	const { companyId } = await makeCompany();
	const { uploadId } = await makeUpload(companyId, null, [
		{ description: 'BIAYA ADM', debit: '30000' },
		{ description: 'TRSF E-BANKING DB 3108/A Payroll August 26 BUDI', debit: '5000000' },
		{ description: 'TRSF E-BANKING DB 3108/B Payroll August 26 BUDI', debit: '5100000' },
		{ description: 'TRANSFER MASUK KLIEN', credit: '9000000' }
	]);
	const seen: { groups: AiGroup[]; accounts: AiAccount[] }[] = [];
	const suggest: SuggestFn = async (groups, accounts) => {
		seen.push({ groups, accounts });
		return {
			ok: true,
			suggestions: groups.map((g) => ({
				groupId: g.groupId,
				accountCode: g.direction === 'DB' ? '5-2001' : '4-1001',
				confidence: g.direction === 'DB' ? 0.95 : 0.6,
				reason: 'uji',
				keyword: g.direction === 'DB' ? 'PAYROLL' : null
			}))
		};
	};
	await runCategorization(uploadId, suggest);

	expect(seen).toHaveLength(1);
	expect(seen[0].groups).toHaveLength(2); // dua payroll dengan deskripsi sama digabung
	expect(seen[0].accounts.some((a) => a.code === '1-1002')).toBe(false);
	const rows = await txns(uploadId);
	expect(rows[0]).toMatchObject({ isConfirmed: true, source: 'RULE' });
	const gaji = await accountIdByCode(companyId, '5-2001');
	for (const r of [rows[1], rows[2]]) {
		expect(r).toMatchObject({ isConfirmed: false, source: 'AI', aiSuggestedAccountId: gaji, aiConfidence: '0.950', aiKeyword: 'PAYROLL' });
	}
	expect(rows[3].aiSuggestedAccountId).toBe(await accountIdByCode(companyId, '4-1001'));
	expect(await upload(uploadId)).toMatchObject({ status: 'review', aiStatus: 'ok' });
});

test('Ollama down: no suggestions, status review, aiStatus unavailable', async () => {
	const { companyId } = await makeCompany();
	const { uploadId } = await makeUpload(companyId, null, [{ description: 'TRANSFER MASUK', credit: '1000' }]);
	await runCategorization(uploadId, async () => {
		throw new OllamaUnavailableError('down');
	});
	expect(await upload(uploadId)).toMatchObject({ status: 'review', aiStatus: 'unavailable' });
	expect((await txns(uploadId))[0].aiSuggestedAccountId).toBeNull();
});

test('failed batch marks partial; all-rule upload becomes done', async () => {
	const { companyId } = await makeCompany();
	const a = await makeUpload(companyId, null, [{ description: 'TRANSFER MASUK', credit: '1000' }], { accountNo: 'A' });
	await runCategorization(a.uploadId, async () => ({ ok: false, suggestions: [] }));
	expect(await upload(a.uploadId)).toMatchObject({ status: 'review', aiStatus: 'partial' });

	const b = await makeUpload(companyId, null, [{ description: 'BIAYA ADM', debit: '30000' }], { accountNo: 'B' });
	let called = false;
	await runCategorization(b.uploadId, async () => {
		called = true;
		return { ok: true, suggestions: [] };
	});
	expect(called).toBe(false);
	expect(await upload(b.uploadId)).toMatchObject({ status: 'done', aiStatus: 'ok' });
});

test('job runner processes queue and records unexpected errors', async () => {
	const { companyId } = await makeCompany();
	const ok = await makeUpload(companyId, null, [{ description: 'BIAYA ADM', debit: '1' }], { accountNo: 'A' });
	const bad = await makeUpload(companyId, null, [{ description: 'APA INI', debit: '1' }], { accountNo: 'B' });
	configureJobs({
		suggest: async () => {
			throw new Error('kaboom');
		}
	});
	enqueueCategorization(ok.uploadId);
	enqueueCategorization(bad.uploadId);
	await jobsIdle();
	expect((await upload(ok.uploadId))?.status).toBe('done');
	expect(await upload(bad.uploadId)).toMatchObject({ status: 'error', errorMessage: 'kaboom' });
});
```
Run: `cd app && bun test tests/integration/pipeline.test.ts` → Expected: FAIL.

- [ ] **Step 4: Implementasi pipeline dan jobs**

`app/src/lib/server/categorize/pipeline.ts`:
```ts
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { listLeafAccounts } from '../accounts/queries';
import { db } from '../db';
import { companies, statementUploads, transactions } from '../db/schema';
import { settleUploadStatus } from '../uploads/status';
import { OllamaUnavailableError, type AiAccount, type AiGroup, type BatchResult } from './ollama';
import { applyRulesToPending, directionOf } from './rules';

export type SuggestFn = (groups: AiGroup[], accounts: AiAccount[]) => Promise<BatchResult>;

const BATCH_SIZE = 10;

export async function runCategorization(uploadId: string, suggest: SuggestFn): Promise<void> {
	const upload = await db.query.statementUploads.findFirst({ where: eq(statementUploads.id, uploadId) });
	if (!upload) return;
	const companyId = upload.companyId;

	// Lapis 1: rule
	await applyRulesToPending(db, companyId, uploadId);

	// Lapis 2: AI untuk yang belum confirmed dan belum punya saran
	const pending = await db
		.select({
			id: transactions.id,
			description: transactions.description,
			groupKey: transactions.groupKey,
			debit: transactions.debit,
			credit: transactions.credit
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.uploadId, uploadId),
				eq(transactions.isConfirmed, false),
				isNull(transactions.aiSuggestedAccountId)
			)
		)
		.orderBy(asc(transactions.lineNo));

	let aiStatus: 'ok' | 'partial' | 'unavailable' = 'ok';
	if (pending.length > 0) {
		const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
		const leaf = (await listLeafAccounts(db, companyId)).filter((a) => a.id !== company?.bankAccountId);
		const idByCode = new Map(leaf.map((a) => [a.code, a.id]));
		const aiAccounts: AiAccount[] = leaf.map((a) => ({ code: a.code, name: a.name, type: a.type }));

		const byKey = new Map<string, typeof pending>();
		for (const t of pending) {
			const key = `${directionOf(t)}|${t.groupKey || t.description.toUpperCase()}`;
			byKey.set(key, [...(byKey.get(key) ?? []), t]);
		}
		const members = new Map<string, string[]>();
		const groups: AiGroup[] = [...byKey.values()].map((list, i) => {
			const groupId = String(i + 1);
			const first = list[0];
			const direction = directionOf(first);
			members.set(groupId, list.map((t) => t.id));
			return { groupId, sample: first.description, direction, amount: direction === 'DB' ? first.debit : first.credit };
		});

		let succeeded = 0;
		let failed = 0;
		for (let i = 0; i < groups.length; i += BATCH_SIZE) {
			let result: BatchResult;
			try {
				result = await suggest(groups.slice(i, i + BATCH_SIZE), aiAccounts);
			} catch (e) {
				if (e instanceof OllamaUnavailableError) {
					aiStatus = succeeded > 0 ? 'partial' : 'unavailable';
					break;
				}
				throw e;
			}
			if (result.ok) succeeded++;
			else failed++;
			for (const s of result.suggestions) {
				const accountId = idByCode.get(s.accountCode);
				const ids = members.get(s.groupId);
				if (!accountId || !ids) continue;
				await db
					.update(transactions)
					.set({
						aiSuggestedAccountId: accountId,
						aiConfidence: s.confidence.toFixed(3),
						aiReason: s.reason,
						aiKeyword: s.keyword,
						source: 'AI'
					})
					.where(inArray(transactions.id, ids));
			}
		}
		if (aiStatus === 'ok' && failed > 0) aiStatus = 'partial';
	}

	await db.update(statementUploads).set({ aiStatus, errorMessage: null }).where(eq(statementUploads.id, uploadId));
	await settleUploadStatus(db, uploadId);
}
```

`app/src/lib/server/jobs.ts`:
```ts
import { eq } from 'drizzle-orm';
import { runCategorization, type SuggestFn } from './categorize/pipeline';
import { suggestAccounts } from './categorize/ollama';
import { db } from './db';
import { statementUploads } from './db/schema';
import { env } from './env';
import { markUploadError } from './uploads/status';

let suggest: SuggestFn = (groups, accounts) =>
	suggestAccounts(groups, accounts, { url: env.OLLAMA_URL, model: env.OLLAMA_MODEL });

const queue: string[] = [];
let running: Promise<void> | null = null;

export function configureJobs(opts: { suggest: SuggestFn }): void {
	suggest = opts.suggest;
}

async function drain(): Promise<void> {
	while (queue.length > 0) {
		const uploadId = queue.shift()!;
		try {
			await runCategorization(uploadId, suggest);
		} catch (e) {
			console.error(`Kategorisasi upload ${uploadId} gagal`, e);
			await markUploadError(db, uploadId, e instanceof Error ? e.message : String(e));
		}
	}
}

/** Antrian in-process, diproses serial. Duplikat diabaikan. */
export function enqueueCategorization(uploadId: string): void {
	if (!queue.includes(uploadId)) queue.push(uploadId);
	running ??= drain().finally(() => {
		running = null;
	});
}

export async function jobsIdle(): Promise<void> {
	while (running) await running;
}

/** Dipanggil saat server start: lanjutkan upload yang terhenti di status processing. */
export async function resumePendingJobs(): Promise<number> {
	const rows = await db
		.select({ id: statementUploads.id })
		.from(statementUploads)
		.where(eq(statementUploads.status, 'processing'));
	for (const r of rows) enqueueCategorization(r.id);
	return rows.length;
}
```

Run: `cd app && bun test tests/integration/pipeline.test.ts` → Expected: PASS.

- [ ] **Step 5: Test service upload yang gagal**

`app/tests/integration/uploads.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { statementUploads, transactions } from '../../src/lib/server/db/schema';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { runCategorization } from '../../src/lib/server/categorize/pipeline';
import { createUpload, deleteUpload, getUpload, type UploadDeps } from '../../src/lib/server/uploads/service';
import type { ParsedStatement } from '../../src/lib/server/uploads/sidecar-client';
import { GET as GET_ONE, DELETE } from '../../src/routes/api/uploads/[id]/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const pdf = (name = 'st.pdf', bytes: BlobPart = new TextEncoder().encode('%PDF-1.4 fake')) =>
	new File([bytes], name, { type: 'application/pdf' });

const statement = (over: Partial<ParsedStatement> = {}): ParsedStatement => ({
	account_no: '1234567890',
	period_start: '2026-08-01',
	period_end: '2026-08-31',
	opening_balance: '1000000.00',
	closing_balance: '970000.00',
	transactions: [
		{ line_no: 1, date: '2026-08-02', description: 'BIAYA ADM 0998', amount: '30000.00', direction: 'DB', balance: '970000.00' },
		{ line_no: 2, date: '2026-08-05', description: 'TRSF MASUK 0508/X PELANGGAN', amount: '50000.00', direction: 'CR', balance: null }
	],
	...over
});

function deps(st: ParsedStatement) {
	const enqueued: string[] = [];
	const d: UploadDeps = { parse: async () => st, enqueue: (id) => enqueued.push(id) };
	return { d, enqueued };
}

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('stores upload and transactions, then enqueues categorization', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { d, enqueued } = deps(statement());
	const res = await createUpload({ companyId, userId: u.id, file: pdf() }, d);
	expect(enqueued).toEqual([res.id]);
	expect(res.balanceWarning).toBeNull();
	const up = await db.query.statementUploads.findFirst({ where: eq(statementUploads.id, res.id) });
	expect(up).toMatchObject({ status: 'processing', accountNo: '1234567890', openingBalance: '1000000.00', filename: 'st.pdf' });
	const rows = await db.select().from(transactions).where(eq(transactions.uploadId, res.id)).orderBy(transactions.lineNo);
	expect(rows[0]).toMatchObject({ debit: '30000.00', credit: '0.00', groupKey: 'BIAYA ADM', balance: '970000.00', txnDate: '2026-08-02' });
	expect(rows[1]).toMatchObject({ debit: '0.00', credit: '50000.00', balance: null });
});

test('validates file name, magic bytes and size', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { d } = deps(statement());
	expect(await codeOf(createUpload({ companyId, userId: u.id, file: pdf('st.txt') }, d))).toBe('invalid_file');
	expect(await codeOf(createUpload({ companyId, userId: u.id, file: pdf('st.pdf', new TextEncoder().encode('hello')) }, d))).toBe('invalid_file');
	const big = new Uint8Array(10 * 1024 * 1024 + 1);
	big.set(new TextEncoder().encode('%PDF'));
	expect(await codeOf(createUpload({ companyId, userId: u.id, file: pdf('big.pdf', big) }, d))).toBe('file_too_large');
});

test('rejects overlapping statement for same account, allows other account', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement()).d);
	expect(await codeOf(createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement()).d))).toBe('duplicate_statement');
	const other = await createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement({ account_no: '999' })).d);
	expect(other.id).toBeString();
});

test('statement without transactions is accepted and settles to done', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const res = await createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement({ transactions: [] })).d);
	await runCategorization(res.id, async () => ({ ok: true, suggestions: [] }));
	expect((await getUpload(companyId, res.id)).status).toBe('done');
});

test('warns when PDF opening balance differs from book balance', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '900000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '900000' }
		]
	});
	const res = await createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement()).d);
	expect(res.balanceWarning).toContain('1.000.000,00');
	expect(res.balanceWarning).toContain('900.000,00');
	const same = await createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement({ account_no: '2', opening_balance: '900000.00' })).d);
	expect(same.balanceWarning).toBeNull();
});

test('upload of another company is 404; delete requires admin', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const u = await makeUser();
	const res = await createUpload({ companyId: a.companyId, userId: u.id, file: pdf() }, deps(statement()).d);
	expect(await codeOf(getUpload(b.companyId, res.id))).toBe('not_found');
	expect(await codeOf(deleteUpload(b.companyId, res.id))).toBe('not_found');

	const accountant = await makeUser();
	await addMember(accountant.id, a.companyId, 'accountant');
	const admin = await makeUser();
	await addMember(admin.id, a.companyId, 'admin');
	const params = { id: res.id };
	expect((await call(GET_ONE, fakeEvent({ ctx: await contextFor(accountant), params }))).status).toBe(200);
	expect((await call(GET_ONE, fakeEvent({ ctx: await contextFor(accountant), params: { id: 'bukan-uuid' } }))).status).toBe(404);
	expect((await call(DELETE, fakeEvent({ ctx: await contextFor(accountant), method: 'DELETE', params }))).status).toBe(403);
	expect((await call(DELETE, fakeEvent({ ctx: await contextFor(admin), method: 'DELETE', params }))).status).toBe(200);
	expect(await db.select().from(transactions)).toHaveLength(0);
});
```
Run: `cd app && bun test tests/integration/uploads.test.ts` → Expected: FAIL.

- [ ] **Step 6: Implementasi service upload, query transaksi, dan route**

`app/src/lib/server/transactions/queries.ts`:
```ts
import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { accounts, journalEntries, statementUploads, transactions } from '../db/schema';

const acc = alias(accounts, 'acc');
const sug = alias(accounts, 'sug');

export async function listTransactions(companyId: string, filter: { uploadId?: string; pendingOnly?: boolean } = {}) {
	const conditions = [eq(transactions.companyId, companyId)];
	if (filter.uploadId) conditions.push(eq(transactions.uploadId, filter.uploadId));
	if (filter.pendingOnly) conditions.push(eq(transactions.isConfirmed, false));
	return db
		.select({
			id: transactions.id,
			uploadId: transactions.uploadId,
			uploadFilename: statementUploads.filename,
			lineNo: transactions.lineNo,
			txnDate: transactions.txnDate,
			description: transactions.description,
			debit: transactions.debit,
			credit: transactions.credit,
			balance: transactions.balance,
			isConfirmed: transactions.isConfirmed,
			source: transactions.source,
			aiConfidence: transactions.aiConfidence,
			aiReason: transactions.aiReason,
			aiKeyword: transactions.aiKeyword,
			groupKey: transactions.groupKey,
			accountId: transactions.accountId,
			accountCode: acc.code,
			accountName: acc.name,
			suggestedAccountId: transactions.aiSuggestedAccountId,
			suggestedCode: sug.code,
			suggestedName: sug.name,
			journalId: journalEntries.id
		})
		.from(transactions)
		.innerJoin(statementUploads, eq(statementUploads.id, transactions.uploadId))
		.leftJoin(acc, eq(acc.id, transactions.accountId))
		.leftJoin(sug, eq(sug.id, transactions.aiSuggestedAccountId))
		.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
		.where(and(...conditions))
		.orderBy(asc(statementUploads.periodStart), asc(transactions.uploadId), asc(transactions.lineNo));
}

export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>[number];
```

`app/src/lib/server/uploads/service.ts`:
```ts
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { D, formatIdr } from '../../money';
import { ApiError, notFound } from '../api';
import { normalizeDescription } from '../categorize/normalize';
import { db } from '../db';
import { companies, journalEntries, statementUploads, transactions } from '../db/schema';
import { balanceAtStartOf } from '../ledger/balance';
import type { ParsedStatement } from './sidecar-client';

const MAX_BYTES = 10 * 1024 * 1024;

export interface UploadDeps {
	parse: (file: File) => Promise<ParsedStatement>;
	enqueue: (uploadId: string) => void;
}

async function validateFile(file: File): Promise<void> {
	if (!file.name.toLowerCase().endsWith('.pdf')) throw new ApiError(400, 'invalid_file', 'File harus berformat PDF');
	if (file.size > MAX_BYTES) throw new ApiError(400, 'file_too_large', 'Ukuran file maksimal 10 MB');
	const head = new TextDecoder().decode(await file.slice(0, 4).arrayBuffer());
	if (head !== '%PDF') throw new ApiError(400, 'invalid_file', 'File bukan PDF yang valid');
}

async function openingBalanceWarning(
	company: { id: string; bankAccountId: string | null },
	parsed: ParsedStatement
): Promise<string | null> {
	if (!company.bankAccountId) return null;
	const opening = await db.query.journalEntries.findFirst({
		where: and(eq(journalEntries.companyId, company.id), eq(journalEntries.type, 'OPENING'))
	});
	if (!opening) return null;
	const book = await balanceAtStartOf(db, company.id, company.bankAccountId, parsed.period_start);
	if (D(book).eq(parsed.opening_balance)) return null;
	return `Saldo awal di PDF (Rp ${formatIdr(parsed.opening_balance)}) berbeda dengan saldo Bank di buku per ${parsed.period_start} (Rp ${formatIdr(book)}).`;
}

export async function createUpload(
	input: { companyId: string; userId: string; file: File },
	deps: UploadDeps
): Promise<{ id: string; balanceWarning: string | null }> {
	await validateFile(input.file);
	const company = await db.query.companies.findFirst({ where: eq(companies.id, input.companyId) });
	if (!company) throw notFound('Perusahaan');

	const parsed = await deps.parse(input.file); // PDF hanya diteruskan dari memori (D12)

	const [duplicate] = await db
		.select({ id: statementUploads.id })
		.from(statementUploads)
		.where(
			and(
				eq(statementUploads.companyId, company.id),
				eq(statementUploads.accountNo, parsed.account_no),
				lte(statementUploads.periodStart, parsed.period_end),
				gte(statementUploads.periodEnd, parsed.period_start)
			)
		)
		.limit(1);
	if (duplicate) {
		throw new ApiError(
			409,
			'duplicate_statement',
			`Statement rekening ${parsed.account_no} untuk periode ini sudah pernah diunggah. Hapus upload lama terlebih dahulu.`
		);
	}

	const balanceWarning = await openingBalanceWarning(company, parsed);

	const id = await db.transaction(async (tx) => {
		const [upload] = await tx
			.insert(statementUploads)
			.values({
				companyId: company.id,
				uploadedBy: input.userId,
				filename: input.file.name,
				accountNo: parsed.account_no,
				periodStart: parsed.period_start,
				periodEnd: parsed.period_end,
				openingBalance: parsed.opening_balance,
				closingBalance: parsed.closing_balance,
				status: 'processing',
				balanceWarning
			})
			.returning({ id: statementUploads.id });
		if (parsed.transactions.length > 0) {
			await tx.insert(transactions).values(
				parsed.transactions.map((t) => ({
					uploadId: upload.id,
					companyId: company.id,
					lineNo: t.line_no,
					txnDate: t.date,
					description: t.description,
					groupKey: normalizeDescription(t.description),
					debit: t.direction === 'DB' ? t.amount : '0',
					credit: t.direction === 'CR' ? t.amount : '0',
					balance: t.balance
				}))
			);
		}
		return upload.id;
	});

	deps.enqueue(id);
	return { id, balanceWarning };
}

export async function listUploads(companyId: string) {
	return db
		.select({
			id: statementUploads.id,
			filename: statementUploads.filename,
			accountNo: statementUploads.accountNo,
			periodStart: statementUploads.periodStart,
			periodEnd: statementUploads.periodEnd,
			status: statementUploads.status,
			aiStatus: statementUploads.aiStatus,
			balanceWarning: statementUploads.balanceWarning,
			uploadedAt: statementUploads.uploadedAt,
			total: sql<number>`count(${transactions.id})::int`,
			pending: sql<number>`(count(${transactions.id}) filter (where ${transactions.isConfirmed} = false))::int`
		})
		.from(statementUploads)
		.leftJoin(transactions, eq(transactions.uploadId, statementUploads.id))
		.where(eq(statementUploads.companyId, companyId))
		.groupBy(statementUploads.id)
		.orderBy(desc(statementUploads.uploadedAt));
}

export async function getUpload(companyId: string, uploadId: string) {
	const upload = await db.query.statementUploads.findFirst({
		where: and(eq(statementUploads.id, uploadId), eq(statementUploads.companyId, companyId))
	});
	if (!upload) throw notFound('Upload');
	return upload;
}

export async function deleteUpload(companyId: string, uploadId: string): Promise<void> {
	const deleted = await db
		.delete(statementUploads)
		.where(and(eq(statementUploads.id, uploadId), eq(statementUploads.companyId, companyId)))
		.returning({ id: statementUploads.id });
	if (deleted.length === 0) throw notFound('Upload');
}

export async function retryCategorization(
	companyId: string,
	uploadId: string,
	enqueue: (id: string) => void
): Promise<void> {
	const upload = await getUpload(companyId, uploadId);
	if (upload.status === 'processing') {
		throw new ApiError(409, 'already_processing', 'Upload ini sedang diproses');
	}
	await db
		.update(statementUploads)
		.set({ status: 'processing', errorMessage: null })
		.where(eq(statementUploads.id, uploadId));
	enqueue(uploadId);
}
```

`app/src/routes/api/uploads/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { ApiError, apiHandler } from '$lib/server/api';
import { enqueueCategorization } from '$lib/server/jobs';
import { requireRole } from '$lib/server/rbac';
import { createUpload, listUploads } from '$lib/server/uploads/service';
import { parseWithSidecar } from '$lib/server/uploads/sidecar-client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json({ uploads: await listUploads(ctx.companyId) });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const form = await event.request.formData().catch(() => null);
		const file = form?.get('file');
		if (!(file instanceof File)) throw new ApiError(400, 'invalid_file', 'File PDF wajib diunggah');
		const result = await createUpload(
			{ companyId: ctx.companyId, userId: ctx.user.id, file },
			{ parse: (f) => parseWithSidecar(f), enqueue: enqueueCategorization }
		);
		return json(result, { status: 201 });
	});
```

`app/src/routes/api/uploads/[id]/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { listTransactions } from '$lib/server/transactions/queries';
import { deleteUpload, getUpload } from '$lib/server/uploads/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const id = parseId(event.params.id, 'Upload');
		const upload = await getUpload(ctx.companyId, id);
		return json({ upload, transactions: await listTransactions(ctx.companyId, { uploadId: id }) });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await deleteUpload(ctx.companyId, parseId(event.params.id, 'Upload'));
		return json({ ok: true });
	});
```

`app/src/routes/api/uploads/[id]/categorize/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { enqueueCategorization } from '$lib/server/jobs';
import { requireRole } from '$lib/server/rbac';
import { retryCategorization } from '$lib/server/uploads/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await retryCategorization(ctx.companyId, parseId(event.params.id, 'Upload'), enqueueCategorization);
		return json({ ok: true });
	});
```

Tambahkan ke `app/src/hooks.server.ts` (di atas `export const handle`):
```ts
import type { ServerInit } from '@sveltejs/kit';
import { assertRuntimeEnv } from '$lib/server/env';
import { resumePendingJobs } from '$lib/server/jobs';

export const init: ServerInit = async () => {
	if (building) return;
	assertRuntimeEnv();
	const resumed = await resumePendingJobs();
	if (resumed > 0) console.log(`Melanjutkan ${resumed} upload yang belum selesai diproses`);
};
```
(Gabungkan import `ServerInit` dengan import `@sveltejs/kit` yang sudah ada.)

- [ ] **Step 7: Jalankan semua test**

Run: `cd app && bun run test`
Expected: semua PASS.

- [ ] **Step 8: Commit**

```bash
git add app/src app/tests
git commit -m "feat(app): statement upload, categorization pipeline, in-process job runner and upload API

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Konfirmasi transaksi, bulk confirm, akun leaf inline, API transaksi & akun

**Files:**
- Create: `app/src/lib/server/transactions/confirm.ts`, `app/src/lib/server/accounts/service.ts`
- Create: `app/src/routes/api/transactions/+server.ts`, `app/src/routes/api/transactions/[id]/confirm/+server.ts`, `app/src/routes/api/transactions/bulk-confirm/+server.ts`
- Create: `app/src/routes/api/accounts/+server.ts`
- Test: `app/tests/integration/confirm.test.ts`, `app/tests/integration/accounts.test.ts`

**Interfaces:**
- Consumes: `assertLeafAccount`, `listLeafAccounts`, `listAccounts` (Task 10); `applyRulesToPending`, `upsertUserRule`, `normalizeKeyword`, `directionOf` (Task 8); `refreshReviewedUploads` (Task 11); `listTransactions` (Task 11); `isUniqueViolation` (Task 4).
- Produces (`transactions/confirm.ts`): `ConfirmInput` (zod: `{ accountId: uuid; rule?: { keyword: string } | null }`), `confirmTransaction(companyId, userId, txnId, input): Promise<{ propagated: number }>`, `BulkConfirmInput` (zod: `{ uploadId: uuid; minConfidence?: number }`, default 0.8), `bulkConfirm(companyId, userId, input): Promise<{ confirmed: number; propagated: number }>`.
- Produces (`accounts/service.ts`): `CreateAccountInput` (zod), `createAccount(companyId, role: Role, input): Promise<{ id: string }>`, `accountInUse(ex, accountId): Promise<boolean>`.
- Produces HTTP: `GET /api/transactions?upload_id=&status=pending|all` (viewer) → `{ transactions }`; `PATCH /api/transactions/:id/confirm` (accountant) → `{ propagated }`; `POST /api/transactions/bulk-confirm` (accountant) → `{ confirmed, propagated }`; `GET /api/accounts?leaf=1` (viewer) → `{ accounts }`; `POST /api/accounts` (accountant) → 201 `{ id }`.

- [ ] **Step 1: Test konfirmasi yang gagal**

`app/tests/integration/confirm.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { categoryRules, journalEntries, statementUploads, transactions } from '../../src/lib/server/db/schema';
import { bulkConfirm, confirmTransaction } from '../../src/lib/server/transactions/confirm';
import { PATCH } from '../../src/routes/api/transactions/[id]/confirm/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUpload, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const txn = (id: string) => db.query.transactions.findFirst({ where: eq(transactions.id, id) });
const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

async function setup() {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const gaji = await accountIdByCode(companyId, '5-2001');
	const { uploadId, txnIds } = await makeUpload(
		companyId,
		null,
		[
			{ description: 'TRSF E-BANKING DB Payroll August BUDI', debit: '5000000' },
			{ description: 'TRSF E-BANKING DB Payroll August SITI', debit: '5100000' },
			{ description: 'TRSF E-BANKING CR Payroll refund', credit: '100000' },
			{ description: 'LAIN-LAIN', debit: '1000' }
		],
		{ status: 'review' }
	);
	return { companyId, u, gaji, uploadId, txnIds };
}

test('confirm with rule propagates to same-direction pending transactions', async () => {
	const { companyId, u, gaji, txnIds } = await setup();
	const res = await confirmTransaction(companyId, u.id, txnIds[0], { accountId: gaji, rule: { keyword: ' payroll ' } });
	expect(res.propagated).toBe(1);
	expect(await txn(txnIds[0])).toMatchObject({ isConfirmed: true, accountId: gaji, source: 'USER', confirmedBy: u.id });
	expect(await txn(txnIds[1])).toMatchObject({ isConfirmed: true, accountId: gaji, source: 'RULE' });
	expect((await txn(txnIds[2]))?.isConfirmed).toBe(false); // arah CR tidak terkena rule DB
	const [rule] = await db.select().from(categoryRules).where(eq(categoryRules.keywordPattern, 'PAYROLL'));
	expect(rule).toMatchObject({ source: 'USER', priority: 100, direction: 'DB', accountId: gaji });
});

test('source is AI when user accepts the AI suggestion; upload becomes done when all confirmed', async () => {
	const { companyId, u, gaji, uploadId, txnIds } = await setup();
	await db.update(transactions).set({ aiSuggestedAccountId: gaji, aiConfidence: '0.700', source: 'AI' }).where(eq(transactions.id, txnIds[3]));
	await confirmTransaction(companyId, u.id, txnIds[3], { accountId: gaji });
	expect((await txn(txnIds[3]))?.source).toBe('AI');
	const lain = await accountIdByCode(companyId, '4-2002');
	for (const id of txnIds.slice(0, 3)) await confirmTransaction(companyId, u.id, id, { accountId: lain });
	expect((await db.query.statementUploads.findFirst({ where: eq(statementUploads.id, uploadId) }))?.status).toBe('done');
});

test('rejects journaled, invalid account, short keyword and foreign transaction', async () => {
	const { companyId, u, gaji, txnIds } = await setup();
	const other = await makeCompany('PT Lain');
	expect(await codeOf(confirmTransaction(companyId, u.id, txnIds[0], { accountId: await accountIdByCode(companyId, '5-2000') }))).toBe('invalid_account');
	expect(await codeOf(confirmTransaction(companyId, u.id, txnIds[0], { accountId: gaji, rule: { keyword: 'ab' } }))).toBe('invalid_keyword');
	expect(await codeOf(confirmTransaction(other.companyId, u.id, txnIds[0], { accountId: gaji }))).toBe('not_found');
	await db.insert(journalEntries).values({ companyId, type: 'TRANSACTION', transactionId: txnIds[0], entryDate: '2026-08-15' });
	expect(await codeOf(confirmTransaction(companyId, u.id, txnIds[0], { accountId: gaji }))).toBe('transaction_journaled');
});

test('bulk confirm accepts suggestions above threshold and learns keywords', async () => {
	const { companyId, u, gaji, uploadId, txnIds } = await setup();
	await db.update(transactions).set({ aiSuggestedAccountId: gaji, aiConfidence: '0.900', aiKeyword: 'PAYROLL AUGUST', source: 'AI' }).where(eq(transactions.id, txnIds[0]));
	await db.update(transactions).set({ aiSuggestedAccountId: gaji, aiConfidence: '0.500', source: 'AI' }).where(eq(transactions.id, txnIds[3]));
	const res = await bulkConfirm(companyId, u.id, { uploadId, minConfidence: 0.8 });
	expect(res).toEqual({ confirmed: 1, propagated: 1 });
	expect((await txn(txnIds[1]))?.source).toBe('RULE');
	expect((await txn(txnIds[3]))?.isConfirmed).toBe(false);
});

test('API: viewer cannot confirm', async () => {
	const { companyId, gaji, txnIds } = await setup();
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const ev = fakeEvent({ ctx: await contextFor(viewer), method: 'PATCH', params: { id: txnIds[0] }, body: { accountId: gaji } });
	expect((await call(PATCH, ev)).status).toBe(403);
});
```
Run: `cd app && bun test tests/integration/confirm.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implementasi konfirmasi**

`app/src/lib/server/transactions/confirm.ts`:
```ts
import { and, eq, gte, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { assertLeafAccount, listLeafAccounts } from '../accounts/queries';
import { ApiError, notFound } from '../api';
import { applyRulesToPending, directionOf, normalizeKeyword, upsertUserRule } from '../categorize/rules';
import { db } from '../db';
import { journalEntries, statementUploads, transactions } from '../db/schema';
import { refreshReviewedUploads } from '../uploads/status';

export const ConfirmInput = z.object({
	accountId: z.uuid(),
	rule: z.object({ keyword: z.string() }).nullable().optional()
});
export type ConfirmInput = z.infer<typeof ConfirmInput>;

export const BulkConfirmInput = z.object({
	uploadId: z.uuid(),
	minConfidence: z.number().min(0).max(1).default(0.8)
});
export type BulkConfirmInput = z.input<typeof BulkConfirmInput>;

export async function confirmTransaction(
	companyId: string,
	userId: string,
	txnId: string,
	input: ConfirmInput
): Promise<{ propagated: number }> {
	return db.transaction(async (tx) => {
		const [t] = await tx
			.select({
				id: transactions.id,
				debit: transactions.debit,
				aiSuggestedAccountId: transactions.aiSuggestedAccountId,
				journalId: journalEntries.id
			})
			.from(transactions)
			.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
			.where(and(eq(transactions.id, txnId), eq(transactions.companyId, companyId)))
			.limit(1);
		if (!t) throw notFound('Transaksi');
		if (t.journalId) {
			throw new ApiError(409, 'transaction_journaled', 'Transaksi sudah dijurnal sehingga kategorinya tidak bisa diubah');
		}
		await assertLeafAccount(tx, companyId, input.accountId);

		let keyword: string | null = null;
		if (input.rule) {
			keyword = normalizeKeyword(input.rule.keyword);
			if (!keyword) throw new ApiError(422, 'invalid_keyword', 'Keyword rule minimal 3 karakter');
		}

		await tx
			.update(transactions)
			.set({
				accountId: input.accountId,
				isConfirmed: true,
				confirmedBy: userId,
				confirmedAt: new Date(),
				source: input.accountId === t.aiSuggestedAccountId ? 'AI' : 'USER'
			})
			.where(eq(transactions.id, t.id));

		let propagated = 0;
		if (keyword) {
			await upsertUserRule(tx, companyId, keyword, input.accountId, directionOf(t));
			propagated = await applyRulesToPending(tx, companyId);
		}
		await refreshReviewedUploads(tx, companyId);
		return { propagated };
	});
}

export async function bulkConfirm(
	companyId: string,
	userId: string,
	input: BulkConfirmInput
): Promise<{ confirmed: number; propagated: number }> {
	const { uploadId, minConfidence } = BulkConfirmInput.parse(input);
	return db.transaction(async (tx) => {
		const upload = await tx.query.statementUploads.findFirst({
			where: and(eq(statementUploads.id, uploadId), eq(statementUploads.companyId, companyId))
		});
		if (!upload) throw notFound('Upload');

		const leaf = new Set((await listLeafAccounts(tx, companyId)).map((a) => a.id));
		const rows = (
			await tx
				.select({
					id: transactions.id,
					debit: transactions.debit,
					accountId: transactions.aiSuggestedAccountId,
					keyword: transactions.aiKeyword
				})
				.from(transactions)
				.where(
					and(
						eq(transactions.uploadId, uploadId),
						eq(transactions.isConfirmed, false),
						isNotNull(transactions.aiSuggestedAccountId),
						gte(transactions.aiConfidence, minConfidence.toFixed(3))
					)
				)
		).filter((r) => r.accountId && leaf.has(r.accountId));

		const now = new Date();
		for (const r of rows) {
			await tx
				.update(transactions)
				.set({ accountId: r.accountId, isConfirmed: true, confirmedBy: userId, confirmedAt: now, source: 'AI' })
				.where(eq(transactions.id, r.id));
		}

		const learned = new Set<string>();
		for (const r of rows) {
			const keyword = normalizeKeyword(r.keyword);
			if (!keyword) continue;
			const direction = directionOf(r);
			const key = `${keyword}|${direction}`;
			if (learned.has(key)) continue;
			learned.add(key);
			await upsertUserRule(tx, companyId, keyword, r.accountId!, direction);
		}

		const propagated = learned.size > 0 ? await applyRulesToPending(tx, companyId) : 0;
		await refreshReviewedUploads(tx, companyId);
		return { confirmed: rows.length, propagated };
	});
}
```

- [ ] **Step 3: Route transaksi**

`app/src/routes/api/transactions/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { listTransactions } from '$lib/server/transactions/queries';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const uploadParam = event.url.searchParams.get('upload_id');
		const transactions = await listTransactions(ctx.companyId, {
			uploadId: uploadParam ? parseId(uploadParam, 'Upload') : undefined,
			pendingOnly: event.url.searchParams.get('status') === 'pending'
		});
		return json({ transactions });
	});
```

`app/src/routes/api/transactions/[id]/confirm/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { ConfirmInput, confirmTransaction } from '$lib/server/transactions/confirm';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const id = parseId(event.params.id, 'Transaksi');
		const input = await parseJson(event.request, ConfirmInput);
		return json(await confirmTransaction(ctx.companyId, ctx.user.id, id, input));
	});
```

`app/src/routes/api/transactions/bulk-confirm/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { BulkConfirmInput, bulkConfirm } from '$lib/server/transactions/confirm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, BulkConfirmInput);
		return json(await bulkConfirm(ctx.companyId, ctx.user.id, input));
	});
```

Run: `cd app && bun test tests/integration/confirm.test.ts` → Expected: PASS.

- [ ] **Step 4: Test akun inline yang gagal**

`app/tests/integration/accounts.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts } from '../../src/lib/server/db/schema';
import { createAccount } from '../../src/lib/server/accounts/service';
import { GET, POST } from '../../src/routes/api/accounts/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('accountant creates leaf inheriting type and normal balance from parent', async () => {
	const { companyId } = await makeCompany();
	const parentId = await accountIdByCode(companyId, '5-2000');
	const { id } = await createAccount(companyId, 'accountant', { code: '5-2014', name: 'Beban Langganan Software', parentId, normalBal: 'CREDIT' });
	const row = await db.query.accounts.findFirst({ where: eq(accounts.id, id) });
	expect(row).toMatchObject({ type: 'EXPENSE', normalBal: 'DEBIT', parentId }); // override normalBal hanya untuk admin
});

test('admin may override normal balance', async () => {
	const { companyId } = await makeCompany();
	const parentId = await accountIdByCode(companyId, '1-2200');
	const { id } = await createAccount(companyId, 'admin', { code: '1-2205', name: 'Akum. Penyusutan Lain', parentId, normalBal: 'CREDIT' });
	expect((await db.query.accounts.findFirst({ where: eq(accounts.id, id) }))?.normalBal).toBe('CREDIT');
});

test('rejects duplicate code, used parent and foreign parent', async () => {
	const { companyId } = await makeCompany();
	const other = await makeCompany('PT Lain');
	const parentId = await accountIdByCode(companyId, '5-2000');
	expect(await codeOf(createAccount(companyId, 'accountant', { code: '5-2001', name: 'X', parentId }))).toBe('duplicate_code');
	const leaf = await accountIdByCode(companyId, '5-2010'); // dipakai rule seed "BIAYA ADM"
	expect(await codeOf(createAccount(companyId, 'accountant', { code: '5-2010-1', name: 'Sub', parentId: leaf }))).toBe('parent_in_use');
	expect(await codeOf(createAccount(companyId, 'accountant', { code: '9-0001', name: 'X', parentId: await accountIdByCode(other.companyId, '5-2000') }))).toBe('invalid_parent');
});

test('API: list leaf accounts for viewer, create requires accountant', async () => {
	const { companyId } = await makeCompany();
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const res = await call(GET, fakeEvent({ ctx: await contextFor(viewer), path: '/api/accounts?leaf=1' }));
	expect(res.status).toBe(200);
	expect(res.body.accounts.some((a: { code: string }) => a.code === '5-2000')).toBe(false);
	const body = { code: '5-2099', name: 'Baru', parentId: await accountIdByCode(companyId, '5-2000') };
	expect((await call(POST, fakeEvent({ ctx: await contextFor(viewer), method: 'POST', body }))).status).toBe(403);
});
```
Run: `cd app && bun test tests/integration/accounts.test.ts` → Expected: FAIL.

- [ ] **Step 5: Implementasi service akun + route**

`app/src/lib/server/accounts/service.ts`:
```ts
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Role } from '../../roles';
import { ApiError } from '../api';
import { db, type Executor } from '../db';
import { isUniqueViolation } from '../db/errors';
import { accounts, categoryRules, companies, journalLines, transactions } from '../db/schema';

export const CreateAccountInput = z.object({
	code: z.string().trim().min(1).max(20),
	name: z.string().trim().min(1).max(200),
	parentId: z.uuid(),
	normalBal: z.enum(['DEBIT', 'CREDIT']).optional(),
	cashFlowCat: z.enum(['OPERATING', 'INVESTING', 'FINANCING']).nullable().optional()
});
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;

/** Akun dianggap terpakai bila direferensikan jurnal, transaksi, rule, atau sebagai akun bank perusahaan. */
export async function accountInUse(ex: Executor, accountId: string): Promise<boolean> {
	const [row] = await ex.execute<{ used: boolean }>(sql`
		select (
			exists (select 1 from ${journalLines} where ${journalLines.accountId} = ${accountId})
			or exists (select 1 from ${transactions} where ${transactions.accountId} = ${accountId} or ${transactions.aiSuggestedAccountId} = ${accountId})
			or exists (select 1 from ${categoryRules} where ${categoryRules.accountId} = ${accountId})
			or exists (select 1 from ${companies} where ${companies.bankAccountId} = ${accountId})
		) as used
	`);
	return Boolean(row?.used);
}

export async function createAccount(companyId: string, role: Role, input: CreateAccountInput): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const parent = await tx.query.accounts.findFirst({
			where: and(eq(accounts.id, input.parentId), eq(accounts.companyId, companyId))
		});
		if (!parent || !parent.isActive) throw new ApiError(422, 'invalid_parent', 'Akun induk tidak valid');
		if (await accountInUse(tx, parent.id)) {
			throw new ApiError(409, 'parent_in_use', 'Akun induk sudah dipakai transaksi/jurnal/rule; pilih akun induk lain');
		}
		const isAdmin = role === 'admin';
		try {
			const [row] = await tx
				.insert(accounts)
				.values({
					companyId,
					code: input.code,
					name: input.name,
					type: parent.type,
					normalBal: isAdmin && input.normalBal ? input.normalBal : parent.normalBal,
					parentId: parent.id,
					cashFlowCat: isAdmin ? (input.cashFlowCat ?? null) : null
				})
				.returning({ id: accounts.id });
			return row;
		} catch (e) {
			if (isUniqueViolation(e)) throw new ApiError(409, 'duplicate_code', `Kode akun ${input.code} sudah dipakai`);
			throw e;
		}
	});
}
```

`app/src/routes/api/accounts/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { listAccounts, listLeafAccounts } from '$lib/server/accounts/queries';
import { createAccount, CreateAccountInput } from '$lib/server/accounts/service';
import { apiHandler, parseJson } from '$lib/server/api';
import { db } from '$lib/server/db';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const leafOnly = event.url.searchParams.get('leaf') === '1';
		const accounts = leafOnly ? await listLeafAccounts(db, ctx.companyId) : await listAccounts(db, ctx.companyId);
		return json({ accounts });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, CreateAccountInput);
		return json(await createAccount(ctx.companyId, ctx.role, input), { status: 201 });
	});
```

- [ ] **Step 6: Jalankan semua test**

Run: `cd app && bun run test`
Expected: semua PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src app/tests
git commit -m "feat(app): transaction confirmation with rule learning, bulk confirm and inline account creation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Generate jurnal, Jurnal Umum, Buku Besar, Neraca Saldo (service + API)

**Files:**
- Create: `app/src/lib/dates.ts`
- Create: `app/src/lib/server/journal/generate.ts`, `app/src/lib/server/journal/queries.ts`, `app/src/lib/server/reports/ledger.ts`, `app/src/lib/server/reports/trial-balance.ts`
- Create: `app/src/routes/api/journal/+server.ts`, `app/src/routes/api/journal/generate/+server.ts`, `app/src/routes/api/reports/ledger/+server.ts`, `app/src/routes/api/reports/trial-balance/+server.ts`
- Test: `app/tests/unit/dates.test.ts`, `app/tests/integration/journal.test.ts`, `app/tests/integration/reports.test.ts`

**Interfaces:**
- Consumes: `buildTransactionLines`, `assertBalanced`, `naturalBalanceAtStartOf`, `signedForNormal` (Task 10); `D`, `sumMoney`, `toMoney` (Task 3).
- Produces (`$lib/dates`): `todayIso(): string`, `monthRange(date: string): { from: string; to: string }`.
- Produces: `generateJournal(companyId, uploadId, userId): Promise<{ created: number }>`; `listJournal(companyId, from, to): Promise<{ entries: JournalEntryView[]; totalDebit: string; totalCredit: string }>` dengan `JournalEntryView { id; entryDate; refNo; description; type; lines: { accountCode; accountName; debit; credit }[] }`.
- Produces: `getLedger(companyId, accountId, from, to): Promise<LedgerView>` (`{ account; openingBalance; lines: { entryDate; refNo; description; debit; credit; balance }[]; totalDebit; totalCredit; closingBalance }`); `getTrialBalance(companyId, asOf): Promise<TrialBalanceView>` (`{ asOf; rows: { accountId; code; name; debit; credit }[]; totalDebit; totalCredit; balanced }`).
- Produces HTTP: `POST /api/journal/generate { uploadId }` (accountant) → `{ created }`; `GET /api/journal?from&to` (viewer); `GET /api/reports/ledger?account_id&from&to` (viewer); `GET /api/reports/trial-balance?as_of` (viewer). `from`/`to`/`as_of` default ke bulan berjalan.

- [ ] **Step 1: Test tanggal (unit) yang gagal**

`app/tests/unit/dates.test.ts`:
```ts
import { expect, test } from 'bun:test';
import { monthRange } from '$lib/dates';

test('monthRange returns first and last day of month', () => {
	expect(monthRange('2026-08-15')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
	expect(monthRange('2028-02-03')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
	expect(monthRange('2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
});
```
Run: `cd app && bun run test:unit` → Expected: FAIL.

`app/src/lib/dates.ts`:
```ts
export function todayIso(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthRange(date: string): { from: string; to: string } {
	const [y, m] = date.split('-').map(Number);
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
	const mm = String(m).padStart(2, '0');
	return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}
```
Run: `cd app && bun run test:unit` → Expected: PASS.

- [ ] **Step 2: Test jurnal yang gagal**

`app/tests/integration/journal.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { journalEntries, journalLines, transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { listJournal } from '../../src/lib/server/journal/queries';
import { accountIdByCode, makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

async function confirmedUpload() {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const beban = await accountIdByCode(companyId, '5-2010');
	const pendapatan = await accountIdByCode(companyId, '4-1001');
	const { uploadId, txnIds } = await makeUpload(companyId, u.id, [
		{ date: '2026-08-02', description: 'BIAYA ADM', debit: '30000' },
		{ date: '2026-08-05', description: 'TRSF MASUK', credit: '2500000' },
		{ date: '2026-08-03', description: 'BIAYA LAIN', debit: '1000' }
	]);
	await db.update(transactions).set({ isConfirmed: true, accountId: beban }).where(eq(transactions.description, 'BIAYA ADM'));
	await db.update(transactions).set({ isConfirmed: true, accountId: pendapatan }).where(eq(transactions.description, 'TRSF MASUK'));
	await db.update(transactions).set({ isConfirmed: true, accountId: beban }).where(eq(transactions.description, 'BIAYA LAIN'));
	return { companyId, bankAccountId, u, beban, pendapatan, uploadId, txnIds };
}

test('creates balanced entries with sequential refs ordered by date', async () => {
	const { companyId, bankAccountId, u, beban, pendapatan, uploadId } = await confirmedUpload();
	expect(await generateJournal(companyId, uploadId, u.id)).toEqual({ created: 3 });
	const entries = await db.select().from(journalEntries).orderBy(asc(journalEntries.refNo));
	expect(entries.map((e) => [e.refNo, e.entryDate])).toEqual([
		['BCA-202608-0001', '2026-08-02'],
		['BCA-202608-0002', '2026-08-03'],
		['BCA-202608-0003', '2026-08-05']
	]);
	const linesOf = (id: string) =>
		db.select({ accountId: journalLines.accountId, debit: journalLines.debit, credit: journalLines.credit }).from(journalLines).where(eq(journalLines.journalId, id));
	expect(await linesOf(entries[0].id)).toEqual(
		expect.arrayContaining([
			{ accountId: beban, debit: '30000.00', credit: '0.00' },
			{ accountId: bankAccountId, debit: '0.00', credit: '30000.00' }
		])
	);
	expect(await linesOf(entries[2].id)).toEqual(
		expect.arrayContaining([
			{ accountId: bankAccountId, debit: '2500000.00', credit: '0.00' },
			{ accountId: pendapatan, debit: '0.00', credit: '2500000.00' }
		])
	);
	expect(await generateJournal(companyId, uploadId, u.id)).toEqual({ created: 0 });
});

test('concurrent generate calls never duplicate entries or refs', async () => {
	const { companyId, u, uploadId } = await confirmedUpload();
	const results = await Promise.all([
		generateJournal(companyId, uploadId, u.id),
		generateJournal(companyId, uploadId, u.id)
	]);
	expect(results.map((r) => r.created).sort()).toEqual([0, 3]);
	const entries = await db.select().from(journalEntries);
	expect(entries).toHaveLength(3);
	expect(new Set(entries.map((e) => e.refNo)).size).toBe(3);
});

test('refuses while transactions are unconfirmed; 404 for foreign upload', async () => {
	const { companyId, u, uploadId, txnIds } = await confirmedUpload();
	await db.update(transactions).set({ isConfirmed: false }).where(eq(transactions.id, txnIds[0]));
	expect(await codeOf(generateJournal(companyId, uploadId, u.id))).toBe('unconfirmed_transactions');
	const other = await makeCompany('PT Lain');
	expect(await codeOf(generateJournal(other.companyId, uploadId, u.id))).toBe('not_found');
});

test('listJournal groups lines per entry and totals', async () => {
	const { companyId, u, uploadId } = await confirmedUpload();
	await generateJournal(companyId, uploadId, u.id);
	const view = await listJournal(companyId, '2026-08-01', '2026-08-31');
	expect(view.entries).toHaveLength(3);
	expect(view.entries[0].lines).toHaveLength(2);
	expect(view.entries[0].lines[0].debit).toBe('30000.00'); // baris debit lebih dulu
	expect(view.totalDebit).toBe('2531000.00');
	expect(view.totalCredit).toBe('2531000.00');
});
```
Run: `cd app && bun test tests/integration/journal.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementasi generate & list jurnal**

`app/src/lib/server/journal/generate.ts`:
```ts
import { and, asc, count, eq, isNull, like, sql } from 'drizzle-orm';
import { ApiError, notFound } from '../api';
import { db, type Tx } from '../db';
import { companies, journalEntries, journalLines, statementUploads, transactions } from '../db/schema';
import { assertBalanced, buildTransactionLines } from './lines';

async function maxRefSeq(tx: Tx, companyId: string, yyyymm: string): Promise<number> {
	const [row] = await tx
		.select({ max: sql<number>`coalesce(max(cast(substring(${journalEntries.refNo} from 12) as integer)), 0)::int` })
		.from(journalEntries)
		.where(and(eq(journalEntries.companyId, companyId), like(journalEntries.refNo, `BCA-${yyyymm}-%`)));
	return row.max;
}

export async function generateJournal(companyId: string, uploadId: string, userId: string): Promise<{ created: number }> {
	return db.transaction(async (tx) => {
		// Serialisasi per perusahaan: mencegah entry ganda & nomor ref bentrok saat klik ganda.
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);

		const upload = await tx.query.statementUploads.findFirst({
			where: and(eq(statementUploads.id, uploadId), eq(statementUploads.companyId, companyId))
		});
		if (!upload) throw notFound('Upload');
		const company = await tx.query.companies.findFirst({ where: eq(companies.id, companyId) });
		if (!company?.bankAccountId) {
			throw new ApiError(409, 'bank_account_not_set', 'Akun bank perusahaan belum diatur di Pengaturan → Perusahaan');
		}

		const [{ pending }] = await tx
			.select({ pending: count() })
			.from(transactions)
			.where(and(eq(transactions.uploadId, uploadId), eq(transactions.isConfirmed, false)));
		if (pending > 0) {
			throw new ApiError(409, 'unconfirmed_transactions', `Masih ada ${pending} transaksi yang belum dikonfirmasi`);
		}

		const rows = await tx
			.select({
				id: transactions.id,
				txnDate: transactions.txnDate,
				description: transactions.description,
				debit: transactions.debit,
				credit: transactions.credit,
				accountId: transactions.accountId
			})
			.from(transactions)
			.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
			.where(and(eq(transactions.uploadId, uploadId), isNull(journalEntries.id)))
			.orderBy(asc(transactions.txnDate), asc(transactions.lineNo));

		const nextSeq = new Map<string, number>();
		for (const t of rows) {
			const yyyymm = t.txnDate.slice(0, 7).replace('-', '');
			if (!nextSeq.has(yyyymm)) nextSeq.set(yyyymm, (await maxRefSeq(tx, companyId, yyyymm)) + 1);
			const seq = nextSeq.get(yyyymm)!;
			nextSeq.set(yyyymm, seq + 1);

			const lines = buildTransactionLines(
				{ debit: t.debit, credit: t.credit, accountId: t.accountId! },
				company.bankAccountId
			);
			assertBalanced(lines);
			const [entry] = await tx
				.insert(journalEntries)
				.values({
					companyId,
					type: 'TRANSACTION',
					uploadId,
					transactionId: t.id,
					entryDate: t.txnDate,
					description: t.description,
					refNo: `BCA-${yyyymm}-${String(seq).padStart(4, '0')}`,
					createdBy: userId
				})
				.returning({ id: journalEntries.id });
			await tx.insert(journalLines).values(lines.map((l) => ({ journalId: entry.id, ...l })));
		}
		return { created: rows.length };
	});
}
```

`app/src/lib/server/journal/queries.ts`:
```ts
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { sumMoney, toMoney } from '../../money';
import { db } from '../db';
import { accounts, journalEntries, journalLines } from '../db/schema';

export interface JournalEntryView {
	id: string;
	entryDate: string;
	refNo: string | null;
	description: string | null;
	type: 'OPENING' | 'TRANSACTION';
	lines: { accountCode: string; accountName: string; debit: string; credit: string }[];
}

export async function listJournal(companyId: string, from: string, to: string) {
	const rows = await db
		.select({
			id: journalEntries.id,
			entryDate: journalEntries.entryDate,
			refNo: journalEntries.refNo,
			description: journalEntries.description,
			type: journalEntries.type,
			accountCode: accounts.code,
			accountName: accounts.name,
			debit: journalLines.debit,
			credit: journalLines.credit
		})
		.from(journalEntries)
		.innerJoin(journalLines, eq(journalLines.journalId, journalEntries.id))
		.innerJoin(accounts, eq(accounts.id, journalLines.accountId))
		.where(and(eq(journalEntries.companyId, companyId), gte(journalEntries.entryDate, from), lte(journalEntries.entryDate, to)))
		.orderBy(asc(journalEntries.entryDate), asc(journalEntries.refNo), desc(journalLines.debit));

	const entries: JournalEntryView[] = [];
	const byId = new Map<string, JournalEntryView>();
	for (const r of rows) {
		let entry = byId.get(r.id);
		if (!entry) {
			entry = { id: r.id, entryDate: r.entryDate, refNo: r.refNo, description: r.description, type: r.type, lines: [] };
			byId.set(r.id, entry);
			entries.push(entry);
		}
		entry.lines.push({ accountCode: r.accountCode, accountName: r.accountName, debit: r.debit, credit: r.credit });
	}
	return {
		entries,
		totalDebit: toMoney(sumMoney(rows.map((r) => r.debit))),
		totalCredit: toMoney(sumMoney(rows.map((r) => r.credit)))
	};
}
```

Run: `cd app && bun test tests/integration/journal.test.ts` → Expected: PASS.

- [ ] **Step 4: Test laporan yang gagal**

`app/tests/integration/reports.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { getLedger } from '../../src/lib/server/reports/ledger';
import { getTrialBalance } from '../../src/lib/server/reports/trial-balance';
import { accountIdByCode, makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function booksWithActivity() {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const modal = await accountIdByCode(companyId, '3-1001');
	const beban = await accountIdByCode(companyId, '5-2010');
	const pendapatan = await accountIdByCode(companyId, '4-1001');
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '1000000', credit: '0' },
			{ accountId: modal, debit: '0', credit: '1000000' }
		]
	});
	const { uploadId } = await makeUpload(companyId, u.id, [
		{ date: '2026-08-02', description: 'BIAYA ADM', debit: '30000' },
		{ date: '2026-08-05', description: 'TRSF MASUK', credit: '2500000' }
	]);
	await db.update(transactions).set({ isConfirmed: true, accountId: beban }).where(eq(transactions.description, 'BIAYA ADM'));
	await db.update(transactions).set({ isConfirmed: true, accountId: pendapatan }).where(eq(transactions.description, 'TRSF MASUK'));
	await generateJournal(companyId, uploadId, u.id);
	return { companyId, bankAccountId, modal, beban, pendapatan };
}

test('ledger of bank: opening, running balance, closing', async () => {
	const { companyId, bankAccountId } = await booksWithActivity();
	const ledger = await getLedger(companyId, bankAccountId, '2026-08-01', '2026-08-31');
	expect(ledger.openingBalance).toBe('1000000.00');
	expect(ledger.lines.map((l) => [l.refNo, l.debit, l.credit, l.balance])).toEqual([
		['BCA-202608-0001', '0.00', '30000.00', '970000.00'],
		['BCA-202608-0002', '2500000.00', '0.00', '3470000.00']
	]);
	expect(ledger.closingBalance).toBe('3470000.00');

	const later = await getLedger(companyId, bankAccountId, '2026-09-01', '2026-09-30');
	expect(later.openingBalance).toBe('3470000.00');
	expect(later.lines).toHaveLength(0);
});

test('credit-normal account shows positive balance', async () => {
	const { companyId, pendapatan } = await booksWithActivity();
	const ledger = await getLedger(companyId, pendapatan, '2026-08-01', '2026-08-31');
	expect(ledger.closingBalance).toBe('2500000.00');
});

test('trial balance is balanced and places balances on the natural side', async () => {
	const { companyId } = await booksWithActivity();
	const tb = await getTrialBalance(companyId, '2026-08-31');
	expect(tb.balanced).toBe(true);
	expect(tb.totalDebit).toBe('3500000.00');
	expect(tb.totalCredit).toBe('3500000.00');
	const byCode = Object.fromEntries(tb.rows.map((r) => [r.code, [r.debit, r.credit]]));
	expect(byCode['1-1002']).toEqual(['3470000.00', '0.00']);
	expect(byCode['5-2010']).toEqual(['30000.00', '0.00']);
	expect(byCode['3-1001']).toEqual(['0.00', '1000000.00']);
	expect(byCode['4-1001']).toEqual(['0.00', '2500000.00']);

	const before = await getTrialBalance(companyId, '2026-07-31');
	expect(before.rows).toHaveLength(0);
	expect(before.balanced).toBe(true);
});

test('ledger for foreign account is 404', async () => {
	const { companyId } = await booksWithActivity();
	const other = await makeCompany('PT Lain');
	await expect(getLedger(companyId, other.bankAccountId, '2026-08-01', '2026-08-31')).rejects.toMatchObject({ code: 'not_found' });
});
```
Run: `cd app && bun test tests/integration/reports.test.ts` → Expected: FAIL.

- [ ] **Step 5: Implementasi laporan**

`app/src/lib/server/reports/ledger.ts`:
```ts
import { and, asc, eq, gte, lte, not, sql } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { notFound } from '../api';
import { db } from '../db';
import { accounts, journalEntries, journalLines } from '../db/schema';
import { naturalBalanceAtStartOf, signedForNormal } from '../ledger/balance';

export async function getLedger(companyId: string, accountId: string, from: string, to: string) {
	const account = await db.query.accounts.findFirst({
		where: and(eq(accounts.id, accountId), eq(accounts.companyId, companyId))
	});
	if (!account) throw notFound('Akun');

	const opening = await naturalBalanceAtStartOf(db, companyId, accountId, from);
	const rows = await db
		.select({
			entryDate: journalEntries.entryDate,
			refNo: journalEntries.refNo,
			description: journalEntries.description,
			debit: journalLines.debit,
			credit: journalLines.credit
		})
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.where(
			and(
				eq(journalEntries.companyId, companyId),
				eq(journalLines.accountId, accountId),
				gte(journalEntries.entryDate, from),
				lte(journalEntries.entryDate, to),
				// OPENING bertanggal `from` sudah masuk saldo awal
				not(and(eq(journalEntries.type, 'OPENING'), eq(journalEntries.entryDate, from))!)
			)
		)
		.orderBy(asc(journalEntries.entryDate), asc(journalEntries.refNo), asc(journalLines.id));

	let running = D(opening);
	const lines = rows.map((r) => {
		running = running.plus(r.debit).minus(r.credit);
		return { ...r, balance: signedForNormal(running, account.normalBal) };
	});
	return {
		account: { id: account.id, code: account.code, name: account.name, normalBal: account.normalBal },
		openingBalance: signedForNormal(opening, account.normalBal),
		lines,
		totalDebit: toMoney(sumMoney(rows.map((r) => r.debit))),
		totalCredit: toMoney(sumMoney(rows.map((r) => r.credit))),
		closingBalance: signedForNormal(running, account.normalBal)
	};
}

export type LedgerView = Awaited<ReturnType<typeof getLedger>>;
```
(Hapus import `sql` bila tidak terpakai.)

`app/src/lib/server/reports/trial-balance.ts`:
```ts
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { db } from '../db';
import { accounts, journalEntries, journalLines } from '../db/schema';

export async function getTrialBalance(companyId: string, asOf: string) {
	const sums = await db
		.select({
			accountId: accounts.id,
			code: accounts.code,
			name: accounts.name,
			natural: sql<string>`sum(${journalLines.debit} - ${journalLines.credit})`
		})
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.innerJoin(accounts, eq(accounts.id, journalLines.accountId))
		.where(and(eq(journalEntries.companyId, companyId), lte(journalEntries.entryDate, asOf)))
		.groupBy(accounts.id, accounts.code, accounts.name)
		.orderBy(asc(accounts.code));

	const rows = sums
		.filter((s) => !D(s.natural).isZero())
		.map((s) => {
			const n = D(s.natural);
			return {
				accountId: s.accountId,
				code: s.code,
				name: s.name,
				debit: toMoney(n.gt(0) ? n : 0),
				credit: toMoney(n.lt(0) ? n.neg() : 0)
			};
		});
	const totalDebit = sumMoney(rows.map((r) => r.debit));
	const totalCredit = sumMoney(rows.map((r) => r.credit));
	return {
		asOf,
		rows,
		totalDebit: toMoney(totalDebit),
		totalCredit: toMoney(totalCredit),
		balanced: totalDebit.eq(totalCredit)
	};
}

export type TrialBalanceView = Awaited<ReturnType<typeof getTrialBalance>>;
```

- [ ] **Step 6: Route jurnal & laporan**

`app/src/routes/api/journal/generate/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { apiHandler, parseJson } from '$lib/server/api';
import { generateJournal } from '$lib/server/journal/generate';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

const Body = z.object({ uploadId: z.uuid() });

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const { uploadId } = await parseJson(event.request, Body);
		return json(await generateJournal(ctx.companyId, uploadId, ctx.user.id));
	});
```

`app/src/routes/api/journal/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { monthRange, todayIso } from '$lib/dates';
import { apiHandler } from '$lib/server/api';
import { listJournal } from '$lib/server/journal/queries';
import { requireRole } from '$lib/server/rbac';
import { dateParam } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const month = monthRange(todayIso());
		const from = dateParam(event.url, 'from') ?? month.from;
		const to = dateParam(event.url, 'to') ?? month.to;
		return json({ from, to, ...(await listJournal(ctx.companyId, from, to)) });
	});
```

`app/src/routes/api/reports/ledger/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { monthRange, todayIso } from '$lib/dates';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { getLedger } from '$lib/server/reports/ledger';
import { dateParam, parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const accountId = parseId(event.url.searchParams.get('account_id'), 'Akun');
		const month = monthRange(todayIso());
		const from = dateParam(event.url, 'from') ?? month.from;
		const to = dateParam(event.url, 'to') ?? month.to;
		return json(await getLedger(ctx.companyId, accountId, from, to));
	});
```

`app/src/routes/api/reports/trial-balance/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { monthRange, todayIso } from '$lib/dates';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { getTrialBalance } from '$lib/server/reports/trial-balance';
import { dateParam } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const asOf = dateParam(event.url, 'as_of') ?? monthRange(todayIso()).to;
		return json(await getTrialBalance(ctx.companyId, asOf));
	});
```

- [ ] **Step 7: Jalankan semua test**

Run: `cd app && bun run test`
Expected: semua PASS.

- [ ] **Step 8: Commit**

```bash
git add app/src app/tests
git commit -m "feat(app): journal generation, general journal, ledger and trial balance

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Komponen UI bersama + halaman eStatement (Upload Baru, Riwayat, Detail)

**Files:**
- Create: `app/src/lib/api-client.ts`, `app/src/lib/ui.ts`, `app/src/lib/server/page.ts`
- Modify: `app/src/lib/dates.ts` (tambah `formatDate`)
- Create: `app/src/lib/components/PageHeader.svelte`, `app/src/lib/components/StatusBadge.svelte`
- Create: `app/src/routes/(app)/uploads/+page.server.ts`, `app/src/routes/(app)/uploads/+page.svelte`
- Create: `app/src/routes/(app)/uploads/new/+page.server.ts`, `app/src/routes/(app)/uploads/new/+page.svelte`
- Create: `app/src/routes/(app)/uploads/[id]/+page.server.ts`, `app/src/routes/(app)/uploads/[id]/+page.svelte`
- Test: `app/tests/unit/api-client.test.ts`, `app/tests/unit/dates.test.ts` (tambah kasus)

**Interfaces:**
- Consumes: `listUploads`, `getUpload` (Task 11), `listTransactions` (Task 11), `requirePageRole` (Task 6), `roleAtLeast`, `formatIdr`.
- Produces (`$lib/api-client`): `class ClientApiError(status, code, message)`, `apiFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T>`.
- Produces (`$lib/ui`): `selectClass`, `inputClass` (string kelas Tailwind untuk elemen native).
- Produces (`$lib/dates`): `formatDate(iso: string | null | undefined): string` (`'2026-08-02'` → `'02/08/2026'`).
- Produces (`server/page.ts`): `withPageErrors<T>(fn: () => Promise<T>): Promise<T>` (ApiError → `error(status, message)`).
- Produces komponen: `PageHeader { title: string; description?: string; actions?: Snippet }`, `StatusBadge { status: 'processing' | 'review' | 'done' | 'error' }`.
- Teks UI yang diandalkan E2E (Task 21): tombol `Unggah`; label status `Perlu review`; tombol `Generate Jurnal`; pesan `<n> jurnal dibuat`.

- [ ] **Step 1: Test unit yang gagal**

`app/tests/unit/api-client.test.ts`:
```ts
import { afterEach, expect, test } from 'bun:test';
import { apiFetch, ClientApiError } from '$lib/api-client';

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

test('sends JSON body and returns parsed data', async () => {
	let seen: RequestInit | undefined;
	globalThis.fetch = (async (_url: string, init: RequestInit) => {
		seen = init;
		return Response.json({ ok: true });
	}) as unknown as typeof fetch;
	expect(await apiFetch<{ ok: boolean }>('/api/x', { method: 'POST', json: { a: 1 } })).toEqual({ ok: true });
	expect(seen?.body).toBe('{"a":1}');
	expect((seen?.headers as Record<string, string>)['content-type']).toBe('application/json');
});

test('throws ClientApiError with server message', async () => {
	globalThis.fetch = (async () =>
		Response.json({ error: { code: 'duplicate_statement', message: 'Sudah ada' } }, { status: 409 })) as unknown as typeof fetch;
	await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 409, code: 'duplicate_statement', message: 'Sudah ada' });
	await expect(apiFetch('/api/x')).rejects.toBeInstanceOf(ClientApiError);
});
```

Tambahkan ke `app/tests/unit/dates.test.ts`:
```ts
import { formatDate } from '$lib/dates';

test('formatDate renders dd/mm/yyyy', () => {
	expect(formatDate('2026-08-02')).toBe('02/08/2026');
	expect(formatDate(null)).toBe('');
});
```
(Gabungkan import dengan import yang sudah ada.)

Run: `cd app && bun run test:unit` → Expected: FAIL.

- [ ] **Step 2: Implementasi helper**

`app/src/lib/api-client.ts`:
```ts
export class ClientApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string
	) {
		super(message);
	}
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
	const { json: payload, headers, ...rest } = init;
	const res = await fetch(path, {
		...rest,
		headers: payload !== undefined ? { 'content-type': 'application/json', ...(headers as Record<string, string>) } : headers,
		body: payload !== undefined ? JSON.stringify(payload) : rest.body
	});
	const data = await res.json().catch(() => null);
	if (!res.ok) {
		throw new ClientApiError(
			res.status,
			data?.error?.code ?? 'error',
			data?.error?.message ?? `Permintaan gagal (HTTP ${res.status})`
		);
	}
	return data as T;
}
```

Tambahkan ke `app/src/lib/dates.ts`:
```ts
export function formatDate(iso: string | null | undefined): string {
	if (!iso) return '';
	const [y, m, d] = iso.slice(0, 10).split('-');
	return `${d}/${m}/${y}`;
}
```

`app/src/lib/ui.ts`:
```ts
const base =
	'rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
export const selectClass = `h-9 w-full ${base}`;
export const inputClass = `h-9 w-full ${base}`;
```

`app/src/lib/server/page.ts`:
```ts
import { error } from '@sveltejs/kit';
import { ApiError } from './api';

/** Untuk load function halaman: ubah ApiError dari service menjadi halaman error SvelteKit. */
export async function withPageErrors<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof ApiError) error(e.status, e.message);
		throw e;
	}
}
```

Run: `cd app && bun run test:unit` → Expected: PASS.

- [ ] **Step 3: Komponen bersama**

`app/src/lib/components/PageHeader.svelte`:
```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, description, actions }: { title: string; description?: string; actions?: Snippet } = $props();
</script>

<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
	<div>
		<h1 class="text-2xl font-semibold">{title}</h1>
		{#if description}
			<p class="mt-1 text-sm text-slate-500">{description}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap gap-2">{@render actions()}</div>
	{/if}
</div>
```

`app/src/lib/components/StatusBadge.svelte`:
```svelte
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { status }: { status: 'processing' | 'review' | 'done' | 'error' } = $props();

	const labels = { processing: 'Memproses', review: 'Perlu review', done: 'Selesai', error: 'Error' } as const;
	const variants = { processing: 'secondary', review: 'outline', done: 'default', error: 'destructive' } as const;
</script>

<Badge variant={variants[status]}>{labels[status]}</Badge>
```

- [ ] **Step 4: Halaman Riwayat Upload**

`app/src/routes/(app)/uploads/+page.server.ts`:
```ts
import { requirePageRole } from '$lib/server/rbac';
import { listUploads } from '$lib/server/uploads/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	return { uploads: await listUploads(ctx.companyId) };
};
```

`app/src/routes/(app)/uploads/+page.svelte`:
```svelte
<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate } from '$lib/dates';
	import { roleAtLeast } from '$lib/roles';
	import { page } from '$app/state';

	let { data } = $props();
	const canUpload = $derived(roleAtLeast(page.data.ctx?.role, 'accountant'));
</script>

<PageHeader title="Riwayat Upload" description="Semua eStatement yang pernah diunggah untuk perusahaan ini.">
	{#snippet actions()}
		{#if canUpload}<Button href="/uploads/new">Upload Baru</Button>{/if}
	{/snippet}
</PageHeader>

{#if data.uploads.length === 0}
	<p class="text-slate-500">Belum ada eStatement yang diunggah.</p>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>File</Table.Head>
				<Table.Head>Rekening</Table.Head>
				<Table.Head>Periode</Table.Head>
				<Table.Head>Status</Table.Head>
				<Table.Head class="text-right">Belum dikonfirmasi</Table.Head>
				<Table.Head>Diunggah</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.uploads as u (u.id)}
				<Table.Row>
					<Table.Cell><a class="text-blue-600 hover:underline" href="/uploads/{u.id}">{u.filename}</a></Table.Cell>
					<Table.Cell>{u.accountNo}</Table.Cell>
					<Table.Cell>{formatDate(u.periodStart)} – {formatDate(u.periodEnd)}</Table.Cell>
					<Table.Cell><StatusBadge status={u.status} /></Table.Cell>
					<Table.Cell class="text-right tabular-nums">{u.pending} / {u.total}</Table.Cell>
					<Table.Cell>{new Date(u.uploadedAt).toLocaleString('id-ID')}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
```

- [ ] **Step 5: Halaman Upload Baru**

`app/src/routes/(app)/uploads/new/+page.server.ts`:
```ts
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	requirePageRole(event, 'accountant');
};
```

`app/src/routes/(app)/uploads/new/+page.svelte`:
```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { apiFetch } from '$lib/api-client';

	let file = $state<File | null>(null);
	let dragging = $state(false);
	let busy = $state(false);
	let errorMessage = $state<string | null>(null);

	function pick(files: FileList | null | undefined) {
		errorMessage = null;
		file = files?.[0] ?? null;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!file) return;
		busy = true;
		errorMessage = null;
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await apiFetch<{ id: string }>('/api/uploads', { method: 'POST', body });
			await goto(`/uploads/${res.id}`);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Upload gagal';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Upload eStatement" description="Unggah eStatement BCA (PDF) dari KlikBCA / m-BCA. File tidak disimpan setelah diproses." />

<Card.Root class="max-w-xl">
	<Card.Content class="pt-6">
		<form class="space-y-4" onsubmit={submit}>
			<label
				class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center {dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300'}"
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(e) => {
					e.preventDefault();
					dragging = false;
					pick(e.dataTransfer?.files);
				}}
			>
				<span class="font-medium">{file ? file.name : 'Seret file PDF ke sini atau klik untuk memilih'}</span>
				<span class="mt-1 text-xs text-slate-500">Maksimal 10 MB</span>
				<input type="file" accept="application/pdf,.pdf" class="sr-only" onchange={(e) => pick(e.currentTarget.files)} />
			</label>
			{#if errorMessage}
				<Alert.Root variant="destructive">
					<Alert.Title>Upload gagal</Alert.Title>
					<Alert.Description>{errorMessage}</Alert.Description>
				</Alert.Root>
			{/if}
			<Button type="submit" disabled={!file || busy}>{busy ? 'Memproses…' : 'Unggah'}</Button>
		</form>
	</Card.Content>
</Card.Root>
```

- [ ] **Step 6: Halaman Detail Upload**

`app/src/routes/(app)/uploads/[id]/+page.server.ts`:
```ts
import { error } from '@sveltejs/kit';
import { roleAtLeast } from '$lib/roles';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { listTransactions } from '$lib/server/transactions/queries';
import { getUpload } from '$lib/server/uploads/service';
import { uuidSchema } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const id = uuidSchema.safeParse(event.params.id);
	if (!id.success) error(404, 'Upload tidak ditemukan');
	const upload = await withPageErrors(() => getUpload(ctx.companyId, id.data));
	const transactions = await listTransactions(ctx.companyId, { uploadId: id.data });
	return {
		upload,
		transactions,
		canWrite: roleAtLeast(ctx.role, 'accountant'),
		canDelete: roleAtLeast(ctx.role, 'admin')
	};
};
```

`app/src/routes/(app)/uploads/[id]/+page.svelte`:
```svelte
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch } from '$lib/api-client';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';

	let { data } = $props();
	const upload = $derived(data.upload);
	const unjournaled = $derived(data.transactions.filter((t) => !t.journalId).length);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);
	let confirmDelete = $state(false);

	$effect(() => {
		if (upload.status !== 'processing') return;
		const timer = setInterval(() => invalidateAll(), 2000);
		return () => clearInterval(timer);
	});

	async function run(action: () => Promise<void>) {
		busy = true;
		message = errorMessage = null;
		try {
			await action();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}

	const generate = () =>
		run(async () => {
			const res = await apiFetch<{ created: number }>('/api/journal/generate', { method: 'POST', json: { uploadId: upload.id } });
			message = `${res.created} jurnal dibuat`;
			await invalidateAll();
		});
	const retry = () =>
		run(async () => {
			await apiFetch(`/api/uploads/${upload.id}/categorize`, { method: 'POST' });
			await invalidateAll();
		});
	const remove = () =>
		run(async () => {
			await apiFetch(`/api/uploads/${upload.id}`, { method: 'DELETE' });
			await goto('/uploads');
		});
</script>

<PageHeader title={upload.filename} description="Rekening {upload.accountNo} · {formatDate(upload.periodStart)} – {formatDate(upload.periodEnd)}">
	{#snippet actions()}
		<StatusBadge status={upload.status} />
		{#if data.canWrite && upload.status === 'review'}
			<Button href="/review" variant="outline">Review transaksi</Button>
		{/if}
		{#if data.canWrite && upload.status === 'done' && unjournaled > 0}
			<Button onclick={generate} disabled={busy}>Generate Jurnal</Button>
		{/if}
		{#if data.canWrite && upload.status === 'error'}
			<Button onclick={retry} disabled={busy} variant="outline">Proses ulang</Button>
		{/if}
		{#if data.canDelete}
			{#if confirmDelete}
				<Button variant="destructive" onclick={remove} disabled={busy}>Ya, hapus upload &amp; jurnalnya</Button>
				<Button variant="ghost" onclick={() => (confirmDelete = false)}>Batal</Button>
			{:else}
				<Button variant="ghost" onclick={() => (confirmDelete = true)}>Hapus</Button>
			{/if}
		{/if}
	{/snippet}
</PageHeader>

<div class="mb-4 space-y-3">
	{#if message}<Alert.Root><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
	{#if errorMessage}<Alert.Root variant="destructive"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}
	{#if upload.balanceWarning}
		<Alert.Root><Alert.Title>Saldo awal berbeda</Alert.Title><Alert.Description>{upload.balanceWarning}</Alert.Description></Alert.Root>
	{/if}
	{#if upload.aiStatus === 'unavailable'}
		<Alert.Root><Alert.Title>AI tidak tersedia</Alert.Title><Alert.Description>Transaksi yang tidak cocok dengan rule perlu dikategorikan manual di halaman Review.</Alert.Description></Alert.Root>
	{:else if upload.aiStatus === 'partial'}
		<Alert.Root><Alert.Description>Sebagian saran AI gagal dibuat; transaksi tersebut perlu dikategorikan manual.</Alert.Description></Alert.Root>
	{/if}
	{#if upload.status === 'error'}
		<Alert.Root variant="destructive"><Alert.Title>Pemrosesan gagal</Alert.Title><Alert.Description>{upload.errorMessage}</Alert.Description></Alert.Root>
	{/if}
	<p class="text-sm text-slate-600">
		Saldo awal Rp {formatIdr(upload.openingBalance)} · Saldo akhir Rp {formatIdr(upload.closingBalance)}
	</p>
</div>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Tanggal</Table.Head>
			<Table.Head>Keterangan</Table.Head>
			<Table.Head class="text-right">Debit</Table.Head>
			<Table.Head class="text-right">Kredit</Table.Head>
			<Table.Head>Akun</Table.Head>
			<Table.Head>Status</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each data.transactions as t (t.id)}
			<Table.Row>
				<Table.Cell class="whitespace-nowrap">{formatDate(t.txnDate)}</Table.Cell>
				<Table.Cell class="max-w-md">{t.description}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{t.debit !== '0.00' ? formatIdr(t.debit) : ''}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{t.credit !== '0.00' ? formatIdr(t.credit) : ''}</Table.Cell>
				<Table.Cell>
					{#if t.accountCode}
						{t.accountCode} {t.accountName}
					{:else if t.suggestedCode}
						<span class="text-slate-500">Saran: {t.suggestedCode} {t.suggestedName}</span>
					{:else}
						<span class="text-slate-400">—</span>
					{/if}
				</Table.Cell>
				<Table.Cell class="space-x-1">
					{#if t.journalId}<Badge>Dijurnal</Badge>{:else if t.isConfirmed}<Badge variant="secondary">{t.source}</Badge>{:else}<Badge variant="outline">Menunggu</Badge>{/if}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
```

- [ ] **Step 7: Verifikasi**

Run: `cd app && bun run check && bun run test:unit`
Expected: `svelte-check` 0 errors; unit test PASS.

Manual (butuh sidecar): `docker build -t jurnalku-sidecar ../sidecar && docker run -d --rm -p 8000:8000 --name jk-sc jurnalku-sidecar`, buat PDF sintetis `../sidecar/.venv/bin/python ../sidecar/tests/make_fixture.py /tmp/jk-sintetis.pdf`, lalu `bun run dev`, login, Upload Baru → pilih `/tmp/jk-sintetis.pdf` → Unggah. Expected: redirect ke detail; status berubah dari "Memproses" ke "Perlu review" (Ollama mati → alert "AI tidak tersedia"); `BIAYA ADM` dan `PLN` sudah ber-akun (RULE). Upload ulang file yang sama → pesan "sudah pernah diunggah". Hentikan dev server dan `docker stop jk-sc`.

- [ ] **Step 8: Commit**

```bash
git add app/src app/tests
git commit -m "feat(app): shared UI helpers and eStatement upload, history and detail pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Halaman Review & Konfirmasi

**Files:**
- Create: `app/src/routes/(app)/review/+page.server.ts`, `app/src/routes/(app)/review/+page.svelte`
- Create: `app/src/lib/components/NewAccountDialog.svelte`

**Interfaces:**
- Consumes: `listTransactions(companyId, { pendingOnly: true })`, `listLeafAccounts`, `listAccounts` (Task 10–11); API `PATCH /api/transactions/:id/confirm`, `POST /api/transactions/bulk-confirm`, `POST /api/accounts` (Task 12); `apiFetch`, `selectClass`, `inputClass` (Task 14).
- Produces: halaman `/review`. Teks yang diandalkan E2E: tombol `Konfirmasi semua saran ≥ 80%`; pesan kosong `Tidak ada transaksi yang menunggu konfirmasi.`
- Produces komponen: `NewAccountDialog { open: boolean (bindable); parents: { id; code; name }[]; oncreated: (account: { id; code; name }) => void }`.

- [ ] **Step 1: Load function**

`app/src/routes/(app)/review/+page.server.ts`:
```ts
import { listAccounts, listLeafAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/db/schema';
import { requirePageRole } from '$lib/server/rbac';
import { listTransactions } from '$lib/server/transactions/queries';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const company = await db.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) });
	const [transactions, leaf, all] = await Promise.all([
		listTransactions(ctx.companyId, { pendingOnly: true }),
		listLeafAccounts(db, ctx.companyId),
		listAccounts(db, ctx.companyId)
	]);
	return {
		transactions,
		accounts: leaf.filter((a) => a.id !== company?.bankAccountId),
		parents: all.filter((a) => a.isActive && !a.isLeaf).map((a) => ({ id: a.id, code: a.code, name: a.name }))
	};
};
```

- [ ] **Step 2: Dialog akun baru**

`app/src/lib/components/NewAccountDialog.svelte`:
```svelte
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { apiFetch } from '$lib/api-client';
	import { selectClass } from '$lib/ui';

	type Option = { id: string; code: string; name: string };
	let {
		open = $bindable(false),
		parents,
		oncreated
	}: { open: boolean; parents: Option[]; oncreated: (a: Option) => void } = $props();

	let code = $state('');
	let name = $state('');
	let parentId = $state('');
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		errorMessage = null;
		try {
			const res = await apiFetch<{ id: string }>('/api/accounts', { method: 'POST', json: { code, name, parentId } });
			oncreated({ id: res.id, code, name });
			code = name = parentId = '';
			open = false;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Gagal membuat akun';
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Akun baru</Dialog.Title>
			<Dialog.Description>Tipe dan saldo normal mengikuti akun induk.</Dialog.Description>
		</Dialog.Header>
		<form class="space-y-3" onsubmit={save}>
			<div class="space-y-1">
				<Label for="na-parent">Akun induk</Label>
				<select id="na-parent" class={selectClass} bind:value={parentId} required>
					<option value="" disabled>Pilih akun induk…</option>
					{#each parents as p (p.id)}<option value={p.id}>{p.code} {p.name}</option>{/each}
				</select>
			</div>
			<div class="space-y-1">
				<Label for="na-code">Kode</Label>
				<Input id="na-code" bind:value={code} placeholder="5-2014" required />
			</div>
			<div class="space-y-1">
				<Label for="na-name">Nama</Label>
				<Input id="na-name" bind:value={name} required />
			</div>
			{#if errorMessage}<p class="text-sm text-red-600">{errorMessage}</p>{/if}
			<Dialog.Footer>
				<Button type="submit" disabled={busy}>Simpan</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 3: Halaman Review**

`app/src/routes/(app)/review/+page.svelte`:
```svelte
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import NewAccountDialog from '$lib/components/NewAccountDialog.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { apiFetch } from '$lib/api-client';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import { inputClass, selectClass } from '$lib/ui';

	let { data } = $props();
	type Txn = (typeof data.transactions)[number];
	type Choice = { accountId: string; keyword: string; makeRule: boolean };

	let overrides = $state<Record<string, Partial<Choice>>>({});
	let extraAccounts = $state<{ id: string; code: string; name: string }[]>([]);
	let dialogOpen = $state(false);
	let dialogFor = $state<string | null>(null);
	let busyId = $state<string | null>(null);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	const accountOptions = $derived([...data.accounts, ...extraAccounts].sort((a, b) => a.code.localeCompare(b.code)));
	const groups = $derived.by(() => {
		const map = new Map<string, { uploadId: string; filename: string; items: Txn[] }>();
		for (const t of data.transactions) {
			const g = map.get(t.uploadId) ?? { uploadId: t.uploadId, filename: t.uploadFilename, items: [] };
			g.items.push(t);
			map.set(t.uploadId, g);
		}
		return [...map.values()];
	});

	function choice(t: Txn): Choice {
		return {
			accountId: t.suggestedAccountId ?? '',
			keyword: t.aiKeyword ?? t.groupKey,
			makeRule: true,
			...overrides[t.id]
		};
	}
	function setChoice(id: string, patch: Partial<Choice>) {
		overrides[id] = { ...overrides[id], ...patch };
	}

	async function act(id: string, fn: () => Promise<string>) {
		busyId = id;
		message = errorMessage = null;
		try {
			message = await fn();
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busyId = null;
		}
	}

	const confirm = (t: Txn) =>
		act(t.id, async () => {
			const c = choice(t);
			const res = await apiFetch<{ propagated: number }>(`/api/transactions/${t.id}/confirm`, {
				method: 'PATCH',
				json: { accountId: c.accountId, rule: c.makeRule ? { keyword: c.keyword } : null }
			});
			return res.propagated > 0
				? `Dikonfirmasi. Rule baru ikut mengonfirmasi ${res.propagated} transaksi lain.`
				: 'Transaksi dikonfirmasi.';
		});

	const bulk = (uploadId: string) =>
		act(uploadId, async () => {
			const res = await apiFetch<{ confirmed: number; propagated: number }>('/api/transactions/bulk-confirm', {
				method: 'POST',
				json: { uploadId, minConfidence: 0.8 }
			});
			return `${res.confirmed} saran AI diterima, ${res.propagated} transaksi lain ikut terkonfirmasi lewat rule.`;
		});
</script>

<PageHeader title="Review & Konfirmasi" description="Transaksi yang belum cocok dengan rule. Pilih akun, lalu konfirmasi; centang 'Buat rule' agar transaksi serupa otomatis terkategori." />

{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

{#if data.transactions.length === 0}
	<p class="text-slate-500">Tidak ada transaksi yang menunggu konfirmasi.</p>
{/if}

{#each groups as g (g.uploadId)}
	<Card.Root class="mb-6">
		<Card.Header class="flex flex-row items-center justify-between gap-4">
			<Card.Title class="text-base"><a href="/uploads/{g.uploadId}" class="hover:underline">{g.filename}</a> · {g.items.length} transaksi</Card.Title>
			<Button variant="outline" size="sm" disabled={busyId !== null} onclick={() => bulk(g.uploadId)}>Konfirmasi semua saran ≥ 80%</Button>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#each g.items as t (t.id)}
				{@const c = choice(t)}
				{@const isDebit = t.debit !== '0.00'}
				<div class="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_18rem]">
					<div>
						<div class="flex flex-wrap items-center gap-2 text-sm">
							<span class="text-slate-500">{formatDate(t.txnDate)}</span>
							<Badge variant={isDebit ? 'destructive' : 'default'}>{isDebit ? 'Keluar' : 'Masuk'}</Badge>
							<span class="font-medium tabular-nums">Rp {formatIdr(isDebit ? t.debit : t.credit)}</span>
						</div>
						<p class="mt-1">{t.description}</p>
						{#if t.suggestedCode}
							<p class="mt-1 text-xs text-slate-500">
								Saran AI: <strong>{t.suggestedCode} {t.suggestedName}</strong>
								({Math.round(Number(t.aiConfidence ?? 0) * 100)}%){t.aiReason ? ` — ${t.aiReason}` : ''}
							</p>
						{:else}
							<p class="mt-1 text-xs text-slate-400">Tidak ada saran AI</p>
						{/if}
					</div>
					<div class="space-y-2">
						<select class={selectClass} value={c.accountId} onchange={(e) => setChoice(t.id, { accountId: e.currentTarget.value })} aria-label="Akun">
							<option value="" disabled>Pilih akun…</option>
							{#each accountOptions as a (a.id)}<option value={a.id}>{a.code} {a.name}</option>{/each}
						</select>
						<label class="flex items-center gap-2 text-xs">
							<input type="checkbox" checked={c.makeRule} onchange={(e) => setChoice(t.id, { makeRule: e.currentTarget.checked })} />
							Buat rule dengan keyword
						</label>
						{#if c.makeRule}
							<input class={inputClass} value={c.keyword} oninput={(e) => setChoice(t.id, { keyword: e.currentTarget.value })} aria-label="Keyword rule" />
						{/if}
						<div class="flex gap-2">
							<Button size="sm" disabled={!c.accountId || busyId !== null} onclick={() => confirm(t)}>Konfirmasi</Button>
							<Button size="sm" variant="ghost" onclick={() => { dialogFor = t.id; dialogOpen = true; }}>Akun baru</Button>
						</div>
					</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
{/each}

<NewAccountDialog
	bind:open={dialogOpen}
	parents={data.parents}
	oncreated={(a) => {
		extraAccounts = [...extraAccounts, a];
		if (dialogFor) setChoice(dialogFor, { accountId: a.id });
	}}
/>
```

- [ ] **Step 4: Verifikasi**

Run: `cd app && bun run check`
Expected: 0 errors.
Manual: lanjutkan dari upload sintetis Task 14 → buka `/review`, pilih akun untuk "BUNGA" (`4-2001`) dengan keyword `BUNGA`, Konfirmasi → transaksi hilang dari daftar. Buat akun baru via dialog di bawah `5-3000` → akun muncul dan terpilih.

- [ ] **Step 5: Commit**

```bash
git add app/src
git commit -m "feat(app): review & confirmation page with rule learning, bulk confirm and inline account dialog

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Halaman Jurnal Umum, Buku Besar, Neraca Saldo, Saldo Awal, Dashboard

**Files:**
- Create: `app/src/routes/(app)/journal/+page.server.ts`, `+page.svelte`
- Create: `app/src/routes/(app)/ledger/+page.server.ts`, `+page.svelte`
- Create: `app/src/routes/(app)/trial-balance/+page.server.ts`, `+page.svelte`
- Create: `app/src/routes/(app)/settings/opening-balance/+page.server.ts`, `+page.svelte`
- Create: `app/src/routes/(app)/dashboard/+page.server.ts`; Modify: `app/src/routes/(app)/dashboard/+page.svelte`

**Interfaces:**
- Consumes: `listJournal`, `getLedger`, `getTrialBalance` (Task 13); `getOpening` (Task 10); `listLeafAccounts`, `listAccounts` (Task 10); `listUploads`, `listTransactions` (Task 11); `monthRange`, `todayIso`, `formatDate`; `withPageErrors`.
- Produces: halaman `/journal`, `/ledger`, `/trial-balance`, `/settings/opening-balance`, `/dashboard`. Teks yang diandalkan E2E: badge Neraca Saldo `Balance` (atau `Tidak balance`).

- [ ] **Step 1: Jurnal Umum**

`app/src/routes/(app)/journal/+page.server.ts`:
```ts
import { monthRange, todayIso } from '$lib/dates';
import { listJournal } from '$lib/server/journal/queries';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { dateParam } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const month = monthRange(todayIso());
	return withPageErrors(async () => {
		const from = dateParam(event.url, 'from') ?? month.from;
		const to = dateParam(event.url, 'to') ?? month.to;
		return { from, to, ...(await listJournal(ctx.companyId, from, to)) };
	});
};
```

`app/src/routes/(app)/journal/+page.svelte`:
```svelte
<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import { inputClass } from '$lib/ui';

	let { data } = $props();
</script>

<PageHeader title="Jurnal Umum" />

<form method="GET" class="mb-4 flex flex-wrap items-end gap-3">
	<label class="text-sm">Dari<input type="date" name="from" value={data.from} class="{inputClass} mt-1" /></label>
	<label class="text-sm">Sampai<input type="date" name="to" value={data.to} class="{inputClass} mt-1" /></label>
	<Button type="submit" variant="outline">Tampilkan</Button>
</form>

{#if data.entries.length === 0}
	<p class="text-slate-500">Belum ada jurnal pada periode ini.</p>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Tanggal</Table.Head>
				<Table.Head>Ref</Table.Head>
				<Table.Head>Keterangan</Table.Head>
				<Table.Head>Akun</Table.Head>
				<Table.Head class="text-right">Debit</Table.Head>
				<Table.Head class="text-right">Kredit</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.entries as e (e.id)}
				{#each e.lines as l, i (i)}
					<Table.Row class={i === 0 ? 'border-t-2' : ''}>
						<Table.Cell class="whitespace-nowrap">{i === 0 ? formatDate(e.entryDate) : ''}</Table.Cell>
						<Table.Cell class="whitespace-nowrap">
							{#if i === 0}{e.refNo}{#if e.type === 'OPENING'} <Badge variant="secondary">Saldo awal</Badge>{/if}{/if}
						</Table.Cell>
						<Table.Cell class="max-w-sm">{i === 0 ? e.description : ''}</Table.Cell>
						<Table.Cell class={l.credit !== '0.00' ? 'pl-8' : ''}>{l.accountCode} {l.accountName}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{l.debit !== '0.00' ? formatIdr(l.debit) : ''}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{l.credit !== '0.00' ? formatIdr(l.credit) : ''}</Table.Cell>
					</Table.Row>
				{/each}
			{/each}
			<Table.Row class="border-t-2 font-semibold">
				<Table.Cell colspan={4}>Total</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(data.totalDebit)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(data.totalCredit)}</Table.Cell>
			</Table.Row>
		</Table.Body>
	</Table.Root>
{/if}
```

- [ ] **Step 2: Buku Besar**

`app/src/routes/(app)/ledger/+page.server.ts`:
```ts
import { monthRange, todayIso } from '$lib/dates';
import { listLeafAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { getLedger } from '$lib/server/reports/ledger';
import { dateParam, uuidSchema } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const accounts = await listLeafAccounts(db, ctx.companyId);
	const month = monthRange(todayIso());
	return withPageErrors(async () => {
		const from = dateParam(event.url, 'from') ?? month.from;
		const to = dateParam(event.url, 'to') ?? month.to;
		const accountParam = uuidSchema.safeParse(event.url.searchParams.get('account_id'));
		const ledger = accountParam.success ? await getLedger(ctx.companyId, accountParam.data, from, to) : null;
		return { accounts, from, to, accountId: accountParam.success ? accountParam.data : '', ledger };
	});
};
```

`app/src/routes/(app)/ledger/+page.svelte`:
```svelte
<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import { inputClass, selectClass } from '$lib/ui';

	let { data } = $props();
</script>

<PageHeader title="Buku Besar" />

<form method="GET" class="mb-4 flex flex-wrap items-end gap-3">
	<label class="min-w-72 text-sm">Akun
		<select name="account_id" class="{selectClass} mt-1" value={data.accountId} required>
			<option value="" disabled>Pilih akun…</option>
			{#each data.accounts as a (a.id)}<option value={a.id}>{a.code} {a.name}</option>{/each}
		</select>
	</label>
	<label class="text-sm">Dari<input type="date" name="from" value={data.from} class="{inputClass} mt-1" /></label>
	<label class="text-sm">Sampai<input type="date" name="to" value={data.to} class="{inputClass} mt-1" /></label>
	<Button type="submit" variant="outline">Tampilkan</Button>
</form>

{#if data.ledger}
	{@const l = data.ledger}
	<h2 class="mb-2 font-medium">{l.account.code} {l.account.name} <span class="text-sm text-slate-500">(saldo normal {l.account.normalBal === 'DEBIT' ? 'debit' : 'kredit'})</span></h2>
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Tanggal</Table.Head>
				<Table.Head>Ref</Table.Head>
				<Table.Head>Keterangan</Table.Head>
				<Table.Head class="text-right">Debit</Table.Head>
				<Table.Head class="text-right">Kredit</Table.Head>
				<Table.Head class="text-right">Saldo</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			<Table.Row class="bg-slate-50">
				<Table.Cell colspan={5}>Saldo awal per {formatDate(data.from)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(l.openingBalance)}</Table.Cell>
			</Table.Row>
			{#each l.lines as line, i (i)}
				<Table.Row>
					<Table.Cell class="whitespace-nowrap">{formatDate(line.entryDate)}</Table.Cell>
					<Table.Cell>{line.refNo}</Table.Cell>
					<Table.Cell class="max-w-sm">{line.description}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{line.debit !== '0.00' ? formatIdr(line.debit) : ''}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{line.credit !== '0.00' ? formatIdr(line.credit) : ''}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatIdr(line.balance)}</Table.Cell>
				</Table.Row>
			{/each}
			<Table.Row class="border-t-2 font-semibold">
				<Table.Cell colspan={3}>Mutasi & saldo akhir per {formatDate(data.to)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(l.totalDebit)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(l.totalCredit)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(l.closingBalance)}</Table.Cell>
			</Table.Row>
		</Table.Body>
	</Table.Root>
{:else}
	<p class="text-slate-500">Pilih akun untuk melihat buku besar.</p>
{/if}
```

- [ ] **Step 3: Neraca Saldo**

`app/src/routes/(app)/trial-balance/+page.server.ts`:
```ts
import { monthRange, todayIso } from '$lib/dates';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { getTrialBalance } from '$lib/server/reports/trial-balance';
import { dateParam } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	return withPageErrors(async () => {
		const asOf = dateParam(event.url, 'as_of') ?? monthRange(todayIso()).to;
		return { tb: await getTrialBalance(ctx.companyId, asOf) };
	});
};
```

`app/src/routes/(app)/trial-balance/+page.svelte`:
```svelte
<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatIdr } from '$lib/money';
	import { inputClass } from '$lib/ui';

	let { data } = $props();
	const tb = $derived(data.tb);
</script>

<PageHeader title="Neraca Saldo">
	{#snippet actions()}
		<Badge variant={tb.balanced ? 'default' : 'destructive'}>{tb.balanced ? 'Balance' : 'Tidak balance'}</Badge>
	{/snippet}
</PageHeader>

<form method="GET" class="mb-4 flex items-end gap-3">
	<label class="text-sm">Per tanggal<input type="date" name="as_of" value={tb.asOf} class="{inputClass} mt-1" /></label>
	<Button type="submit" variant="outline">Tampilkan</Button>
</form>

{#if tb.rows.length === 0}
	<p class="text-slate-500">Belum ada saldo pada tanggal ini.</p>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Kode</Table.Head>
				<Table.Head>Akun</Table.Head>
				<Table.Head class="text-right">Debit</Table.Head>
				<Table.Head class="text-right">Kredit</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each tb.rows as r (r.accountId)}
				<Table.Row>
					<Table.Cell>{r.code}</Table.Cell>
					<Table.Cell>{r.name}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{r.debit !== '0.00' ? formatIdr(r.debit) : ''}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{r.credit !== '0.00' ? formatIdr(r.credit) : ''}</Table.Cell>
				</Table.Row>
			{/each}
			<Table.Row class="border-t-2 font-semibold">
				<Table.Cell colspan={2}>Total</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(tb.totalDebit)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(tb.totalCredit)}</Table.Cell>
			</Table.Row>
		</Table.Body>
	</Table.Root>
{/if}
```

- [ ] **Step 4: Saldo Awal**

`app/src/routes/(app)/settings/opening-balance/+page.server.ts`:
```ts
import { listLeafAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { getOpening } from '$lib/server/journal/opening';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const [accounts, opening] = await Promise.all([listLeafAccounts(db, ctx.companyId), getOpening(ctx.companyId)]);
	return { accounts, opening };
};
```

`app/src/routes/(app)/settings/opening-balance/+page.svelte`:
```svelte
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch } from '$lib/api-client';
	import { todayIso } from '$lib/dates';
	import { formatIdr, sumMoney, toMoney } from '$lib/money';
	import { inputClass } from '$lib/ui';

	let { data } = $props();

	function initial() {
		const byAccount = new Map((data.opening?.lines ?? []).map((l) => [l.accountId, l]));
		return Object.fromEntries(
			data.accounts.map((a) => {
				const l = byAccount.get(a.id);
				return [a.id, { debit: l && l.debit !== '0.00' ? l.debit : '', credit: l && l.credit !== '0.00' ? l.credit : '' }];
			})
		) as Record<string, { debit: string; credit: string }>;
	}

	const initialDate = () => data.opening?.date ?? todayIso();
	let date = $state(initialDate());
	let values = $state(initial());
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	const safe = (v: string) => (/^\d+(\.\d{1,2})?$/.test(v.trim()) ? v.trim() : '0');
	const totalDebit = $derived(sumMoney(Object.values(values).map((v) => safe(v.debit))));
	const totalCredit = $derived(sumMoney(Object.values(values).map((v) => safe(v.credit))));
	const balanced = $derived(totalDebit.eq(totalCredit) && !totalDebit.isZero());

	async function save() {
		busy = true;
		message = errorMessage = null;
		try {
			const lines = Object.entries(values).map(([accountId, v]) => ({
				accountId,
				debit: toMoney(safe(v.debit)),
				credit: toMoney(safe(v.credit))
			}));
			await apiFetch('/api/opening-balance', { method: 'PUT', json: { date, lines } });
			message = 'Saldo awal disimpan.';
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Gagal menyimpan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Saldo Awal" description="Saldo per akun pada tanggal mulai pembukuan di Jurnalku. Total debit harus sama dengan total kredit.">
	{#snippet actions()}
		<Badge variant={balanced ? 'default' : 'destructive'}>{balanced ? 'Balance' : 'Belum balance'}</Badge>
		<Button onclick={save} disabled={!balanced || busy}>Simpan</Button>
	{/snippet}
</PageHeader>

{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<label class="mb-4 block max-w-xs text-sm">Tanggal mulai<input type="date" bind:value={date} class="{inputClass} mt-1" /></label>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Akun</Table.Head>
			<Table.Head class="w-48 text-right">Debit</Table.Head>
			<Table.Head class="w-48 text-right">Kredit</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each data.accounts as a (a.id)}
			<Table.Row>
				<Table.Cell>{a.code} {a.name}</Table.Cell>
				<Table.Cell><input class="{inputClass} text-right" inputmode="decimal" placeholder="0" bind:value={values[a.id].debit} aria-label="Debit {a.code}" /></Table.Cell>
				<Table.Cell><input class="{inputClass} text-right" inputmode="decimal" placeholder="0" bind:value={values[a.id].credit} aria-label="Kredit {a.code}" /></Table.Cell>
			</Table.Row>
		{/each}
		<Table.Row class="border-t-2 font-semibold">
			<Table.Cell>Total</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatIdr(totalDebit)}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatIdr(totalCredit)}</Table.Cell>
		</Table.Row>
	</Table.Body>
</Table.Root>
<p class="mt-2 text-xs text-slate-500">Format angka: gunakan titik untuk desimal, tanpa pemisah ribuan (contoh 1500000.50).</p>
```

- [ ] **Step 5: Dashboard**

`app/src/routes/(app)/dashboard/+page.server.ts`:
```ts
import { monthRange, todayIso } from '$lib/dates';
import { getOpening } from '$lib/server/journal/opening';
import { requirePageRole } from '$lib/server/rbac';
import { getTrialBalance } from '$lib/server/reports/trial-balance';
import { listTransactions } from '$lib/server/transactions/queries';
import { listUploads } from '$lib/server/uploads/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const asOf = monthRange(todayIso()).to;
	const [pending, uploads, tb, opening] = await Promise.all([
		listTransactions(ctx.companyId, { pendingOnly: true }),
		listUploads(ctx.companyId),
		getTrialBalance(ctx.companyId, asOf),
		getOpening(ctx.companyId)
	]);
	return {
		pendingCount: pending.length,
		recentUploads: uploads.slice(0, 5),
		trialBalance: { asOf, balanced: tb.balanced, accounts: tb.rows.length },
		hasOpening: opening !== null
	};
};
```

`app/src/routes/(app)/dashboard/+page.svelte` (ganti seluruh isi):
```svelte
<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { formatDate } from '$lib/dates';

	let { data } = $props();
</script>

<PageHeader title="Dashboard" />

<div class="grid gap-4 md:grid-cols-3">
	<Card.Root>
		<Card.Header><Card.Description>Menunggu konfirmasi</Card.Description><Card.Title class="text-3xl">{data.pendingCount}</Card.Title></Card.Header>
		<Card.Content><a href="/review" class="text-sm text-blue-600 hover:underline">Buka Review & Konfirmasi</a></Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Neraca Saldo per {formatDate(data.trialBalance.asOf)}</Card.Description>
			<Card.Title class="text-3xl {data.trialBalance.balanced ? 'text-green-700' : 'text-red-700'}">{data.trialBalance.balanced ? 'Balance' : 'Tidak balance'}</Card.Title>
		</Card.Header>
		<Card.Content><a href="/trial-balance" class="text-sm text-blue-600 hover:underline">Lihat Neraca Saldo</a></Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header><Card.Description>Saldo awal</Card.Description><Card.Title class="text-xl">{data.hasOpening ? 'Sudah diisi' : 'Belum diisi'}</Card.Title></Card.Header>
		<Card.Content><a href="/settings/opening-balance" class="text-sm text-blue-600 hover:underline">Atur Saldo Awal</a></Card.Content>
	</Card.Root>
</div>

<h2 class="mt-8 mb-3 font-medium">Upload terakhir</h2>
{#if data.recentUploads.length === 0}
	<p class="text-slate-500">Belum ada upload. <a href="/uploads/new" class="text-blue-600 hover:underline">Unggah eStatement pertama</a>.</p>
{:else}
	<ul class="divide-y rounded-md border bg-white">
		{#each data.recentUploads as u (u.id)}
			<li class="flex items-center justify-between p-3 text-sm">
				<a href="/uploads/{u.id}" class="hover:underline">{u.filename} · {formatDate(u.periodStart)} – {formatDate(u.periodEnd)}</a>
				<StatusBadge status={u.status} />
			</li>
		{/each}
	</ul>
{/if}
```

- [ ] **Step 6: Verifikasi**

Run: `cd app && bun run check && bun run test`
Expected: 0 error, semua test PASS.
Manual: isi Saldo Awal (Bank BCA debit = saldo awal PDF sintetis `1000000`, Modal Saham Disetor kredit `1000000`) → Simpan. Selesaikan review upload sintetis → Generate Jurnal di detail upload → `/journal?from=2026-08-01&to=2026-08-31` menampilkan entry; `/ledger` untuk Bank BCA menampilkan saldo akhir `3.020.987,65`; `/trial-balance?as_of=2026-08-31` menampilkan badge "Balance".

- [ ] **Step 7: Commit**

```bash
git add app/src
git commit -m "feat(app): journal, ledger, trial balance, opening balance and dashboard pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Pengaturan — service & API (perusahaan, pengguna, CoA, rules)

**Files:**
- Create: `app/src/lib/server/company/service.ts`, `app/src/lib/server/users/service.ts`, `app/src/lib/server/rules/service.ts`
- Modify: `app/src/lib/server/accounts/service.ts` (tambah `UpdateAccountInput`, `updateAccount`, `deactivateAccount`)
- Create: `app/src/routes/api/companies/+server.ts` (tambah `POST`), `app/src/routes/api/companies/[id]/+server.ts`
- Create: `app/src/routes/api/users/+server.ts`, `app/src/routes/api/users/[id]/+server.ts`, `app/src/routes/api/users/[id]/role/+server.ts`, `app/src/routes/api/users/[id]/super-admin/+server.ts`
- Create: `app/src/routes/api/accounts/[id]/+server.ts`
- Create: `app/src/routes/api/rules/+server.ts`, `app/src/routes/api/rules/[id]/+server.ts`
- Test: `app/tests/integration/settings.test.ts`

**Interfaces:**
- Consumes: `createCompany` (Task 5), `createUserWithPassword`, `findUserByEmail` (Task 5), `assertLeafAccount` (Task 10), `normalizeKeyword` (Task 8), `accountInUse` (Task 12), `isUniqueViolation`.
- Produces (`company/service.ts`): `UpdateCompanyInput`, `CreateCompanyInput`, `getCompany(companyId)`, `updateCompany(companyId, input): Promise<void>`.
- Produces (`users/service.ts`): `AddMemberInput`, `listMembers(companyId)`, `addMember(companyId, input): Promise<{ userId: string; created: boolean }>`, `changeRole(companyId, userId, role): Promise<void>`, `removeMember(companyId, userId): Promise<void>`, `setSuperAdmin(actorId, userId, value): Promise<void>`.
- Produces (`accounts/service.ts`): `UpdateAccountInput`, `updateAccount(companyId, accountId, input): Promise<void>`, `deactivateAccount(companyId, accountId): Promise<void>`.
- Produces (`rules/service.ts`): `CreateRuleInput`, `listRules(companyId)`, `createRule(companyId, input): Promise<{ id: string }>`, `deleteRule(companyId, ruleId): Promise<void>`.
- Produces HTTP: `POST /api/companies` (super admin) → 201 `{ id }`; `PATCH /api/companies/:id` (admin, hanya perusahaan aktif); `GET|POST /api/users` (admin); `PATCH /api/users/:id/role` (admin); `DELETE /api/users/:id` (admin; lepas dari perusahaan); `PATCH /api/users/:id/super-admin` (super admin); `PATCH|DELETE /api/accounts/:id` (admin; DELETE = nonaktifkan); `GET /api/rules` (viewer), `POST /api/rules` (accountant), `DELETE /api/rules/:id` (admin).

- [ ] **Step 1: Test yang gagal**

`app/tests/integration/settings.test.ts`:
```ts
import { beforeEach, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, authAccount, categoryRules, companies, user, userCompanies } from '../../src/lib/server/db/schema';
import { deactivateAccount, updateAccount } from '../../src/lib/server/accounts/service';
import { updateCompany } from '../../src/lib/server/company/service';
import { createRule, deleteRule, listRules } from '../../src/lib/server/rules/service';
import { addMember, changeRole, listMembers, removeMember, setSuperAdmin } from '../../src/lib/server/users/service';
import { verifyPassword } from '../../src/lib/server/password';
import { PATCH as PATCH_COMPANY } from '../../src/routes/api/companies/[id]/+server';
import { POST as CREATE_COMPANY } from '../../src/routes/api/companies/+server';
import { accountIdByCode, addMember as addMemberRaw, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('updateCompany validates bank account is an active ASSET leaf of the company', async () => {
	const { companyId } = await makeCompany();
	const kas = await accountIdByCode(companyId, '1-1001');
	await updateCompany(companyId, { name: 'PT Baru', npwp: '01.234', address: 'Bandung', bankAccountId: kas });
	expect(await db.query.companies.findFirst({ where: eq(companies.id, companyId) })).toMatchObject({ name: 'PT Baru', bankAccountId: kas });
	expect(await codeOf(updateCompany(companyId, { name: 'X', bankAccountId: await accountIdByCode(companyId, '5-2010') }))).toBe('invalid_bank_account');
});

test('company API: admin edits only active company; only super admin creates', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const admin = await makeUser();
	await addMemberRaw(admin.id, a.companyId, 'admin');
	const ctx = await contextFor(admin);
	expect((await call(PATCH_COMPANY, fakeEvent({ ctx, method: 'PATCH', params: { id: a.companyId }, body: { name: 'PT A2' } }))).status).toBe(200);
	expect((await call(PATCH_COMPANY, fakeEvent({ ctx, method: 'PATCH', params: { id: b.companyId }, body: { name: 'X' } }))).status).toBe(404);
	expect((await call(CREATE_COMPANY, fakeEvent({ ctx, method: 'POST', body: { name: 'PT C' } }))).status).toBe(403);
	const su = await makeUser({ isSuperAdmin: true });
	const res = await call(CREATE_COMPANY, fakeEvent({ ctx: await contextFor(su), method: 'POST', body: { name: 'PT C' } }));
	expect(res.status).toBe(201);
	expect(await db.select().from(accounts).where(eq(accounts.companyId, res.body.id))).toHaveLength(76);
});

test('members: create new user, link existing user, change role, last-admin guard, remove', async () => {
	const { companyId } = await makeCompany();
	const other = await makeCompany('PT Lain');
	const created = await addMember(companyId, { email: 'Baru@Test.Local', name: 'Baru', password: 'password123', role: 'accountant' });
	expect(created.created).toBe(true);
	const u = await db.query.user.findFirst({ where: eq(user.email, 'baru@test.local') });
	expect(u).toBeDefined();

	const linked = await addMember(other.companyId, { email: 'baru@test.local', role: 'viewer' });
	expect(linked).toEqual({ userId: u!.id, created: false });
	expect(await codeOf(addMember(companyId, { email: 'baru@test.local', role: 'viewer' }))).toBe('already_member');
	expect(await codeOf(addMember(companyId, { email: 'tanpa@test.local', role: 'viewer' }))).toBe('password_required');

	const admin = await makeUser();
	await addMemberRaw(admin.id, companyId, 'admin');
	expect(await codeOf(changeRole(companyId, admin.id, 'viewer'))).toBe('last_admin');
	expect(await codeOf(removeMember(companyId, admin.id))).toBe('last_admin');
	await changeRole(companyId, u!.id, 'admin');
	await changeRole(companyId, admin.id, 'viewer');
	await removeMember(companyId, admin.id);
	expect((await listMembers(companyId)).map((m) => m.email)).toEqual(['baru@test.local']);
	expect(await codeOf(changeRole(companyId, admin.id, 'viewer'))).toBe('not_found');
});

test('setSuperAdmin cannot change self', async () => {
	const su = await makeUser({ isSuperAdmin: true });
	const u = await makeUser();
	await setSuperAdmin(su.id, u.id, true);
	expect((await db.query.user.findFirst({ where: eq(user.id, u.id) }))?.isSuperAdmin).toBe(true);
	expect(await codeOf(setSuperAdmin(su.id, su.id, false))).toBe('cannot_change_self');
});

test('accounts: update fields, duplicate code, deactivate except bank account', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const sewa = await accountIdByCode(companyId, '5-2003');
	await updateAccount(companyId, sewa, { name: 'Beban Sewa Kantor', cashFlowCat: 'OPERATING' });
	expect(await db.query.accounts.findFirst({ where: eq(accounts.id, sewa) })).toMatchObject({ name: 'Beban Sewa Kantor', cashFlowCat: 'OPERATING' });
	expect(await codeOf(updateAccount(companyId, sewa, { code: '5-2004' }))).toBe('duplicate_code');
	await deactivateAccount(companyId, sewa);
	expect((await db.query.accounts.findFirst({ where: eq(accounts.id, sewa) }))?.isActive).toBe(false);
	expect(await codeOf(deactivateAccount(companyId, bankAccountId))).toBe('bank_account');
});

test('rules: create USER rule, reject duplicates and non-leaf accounts, delete', async () => {
	const { companyId } = await makeCompany();
	const gaji = await accountIdByCode(companyId, '5-2001');
	const { id } = await createRule(companyId, { keyword: ' payroll ', accountId: gaji, direction: 'DB' });
	const rule = await db.query.categoryRules.findFirst({ where: eq(categoryRules.id, id) });
	expect(rule).toMatchObject({ keywordPattern: 'PAYROLL', source: 'USER', priority: 100, direction: 'DB' });
	expect(await codeOf(createRule(companyId, { keyword: 'PAYROLL', accountId: gaji, direction: 'DB' }))).toBe('duplicate_rule');
	expect(await codeOf(createRule(companyId, { keyword: 'GAJI', accountId: await accountIdByCode(companyId, '5-2000') }))).toBe('invalid_account');
	expect((await listRules(companyId)).some((r) => r.keywordPattern === 'PAYROLL' && r.accountCode === '5-2001')).toBe(true);
	await deleteRule(companyId, id);
	expect(await db.select().from(categoryRules).where(and(eq(categoryRules.companyId, companyId), eq(categoryRules.keywordPattern, 'PAYROLL')))).toHaveLength(0);
});

test('new member password is hashed and verifiable', async () => {
	const { companyId } = await makeCompany();
	await addMember(companyId, { email: 'p@test.local', name: 'P', password: 'rahasia123', role: 'viewer' });
	const u = await db.query.user.findFirst({ where: eq(user.email, 'p@test.local') });
	const [cred] = await db.select().from(authAccount).where(eq(authAccount.userId, u!.id));
	expect(await verifyPassword('rahasia123', cred.password!)).toBe(true);
	expect(await db.select().from(userCompanies).where(eq(userCompanies.userId, u!.id))).toHaveLength(1);
});
```
Run: `cd app && bun test tests/integration/settings.test.ts` → Expected: FAIL.

- [ ] **Step 2: Service perusahaan**

`app/src/lib/server/company/service.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertLeafAccount } from '../accounts/queries';
import { ApiError, notFound } from '../api';
import { db } from '../db';
import { companies } from '../db/schema';

export const CreateCompanyInput = z.object({
	name: z.string().trim().min(1).max(200),
	npwp: z.string().trim().max(20).nullable().optional(),
	address: z.string().trim().max(500).nullable().optional()
});

export const UpdateCompanyInput = CreateCompanyInput.extend({ bankAccountId: z.uuid().nullable().optional() });
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInput>;

export async function getCompany(companyId: string) {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (!company) throw notFound('Perusahaan');
	return company;
}

export async function updateCompany(companyId: string, input: UpdateCompanyInput): Promise<void> {
	await db.transaction(async (tx) => {
		if (input.bankAccountId) {
			let account;
			try {
				account = await assertLeafAccount(tx, companyId, input.bankAccountId);
			} catch {
				account = null;
			}
			if (!account || account.type !== 'ASSET') {
				throw new ApiError(422, 'invalid_bank_account', 'Akun bank harus akun aset detail (leaf) yang aktif');
			}
		}
		const updated = await tx
			.update(companies)
			.set({
				name: input.name,
				npwp: input.npwp ?? null,
				address: input.address ?? null,
				...(input.bankAccountId !== undefined ? { bankAccountId: input.bankAccountId } : {})
			})
			.where(and(eq(companies.id, companyId)))
			.returning({ id: companies.id });
		if (updated.length === 0) throw notFound('Perusahaan');
	});
}
```

- [ ] **Step 3: Service pengguna**

`app/src/lib/server/users/service.ts`:
```ts
import { and, asc, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Role } from '../../roles';
import { ApiError, notFound } from '../api';
import { db, type Executor } from '../db';
import { user, userCompanies } from '../db/schema';
import { createUserWithPassword, findUserByEmail } from './create';

const roleEnum = z.enum(['admin', 'accountant', 'viewer']);

export const AddMemberInput = z.object({
	email: z.email(),
	name: z.string().trim().min(1).max(200).optional(),
	password: z.string().min(8).optional(),
	role: roleEnum
});
export type AddMemberInput = z.infer<typeof AddMemberInput>;
export const ChangeRoleInput = z.object({ role: roleEnum });
export const SuperAdminInput = z.object({ value: z.boolean() });

export async function listMembers(companyId: string) {
	return db
		.select({ userId: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin, role: userCompanies.role })
		.from(userCompanies)
		.innerJoin(user, eq(user.id, userCompanies.userId))
		.where(eq(userCompanies.companyId, companyId))
		.orderBy(asc(user.email));
}

export async function addMember(companyId: string, input: AddMemberInput): Promise<{ userId: string; created: boolean }> {
	return db.transaction(async (tx) => {
		const existing = await findUserByEmail(tx, input.email);
		let userId: string;
		let created = false;
		if (existing) {
			userId = existing.id;
			const [membership] = await tx
				.select({ id: userCompanies.id })
				.from(userCompanies)
				.where(and(eq(userCompanies.userId, userId), eq(userCompanies.companyId, companyId)));
			if (membership) throw new ApiError(409, 'already_member', 'Pengguna sudah terdaftar di perusahaan ini');
		} else {
			if (!input.password || !input.name) {
				throw new ApiError(422, 'password_required', 'Pengguna baru wajib diberi nama dan password awal (min. 8 karakter)');
			}
			userId = (await createUserWithPassword(tx, { email: input.email, name: input.name, password: input.password })).id;
			created = true;
		}
		await tx.insert(userCompanies).values({ userId, companyId, role: input.role });
		return { userId, created };
	});
}

async function membership(ex: Executor, companyId: string, userId: string) {
	const [row] = await ex
		.select({ id: userCompanies.id, role: userCompanies.role })
		.from(userCompanies)
		.where(and(eq(userCompanies.companyId, companyId), eq(userCompanies.userId, userId)));
	if (!row) throw notFound('Pengguna');
	return row;
}

async function assertNotLastAdmin(ex: Executor, companyId: string, currentRole: Role) {
	if (currentRole !== 'admin') return;
	const [{ admins }] = await ex
		.select({ admins: count() })
		.from(userCompanies)
		.where(and(eq(userCompanies.companyId, companyId), eq(userCompanies.role, 'admin')));
	if (admins <= 1) throw new ApiError(409, 'last_admin', 'Perusahaan harus memiliki minimal satu admin');
}

export async function changeRole(companyId: string, userId: string, role: Role): Promise<void> {
	await db.transaction(async (tx) => {
		const m = await membership(tx, companyId, userId);
		if (role !== 'admin') await assertNotLastAdmin(tx, companyId, m.role);
		await tx.update(userCompanies).set({ role }).where(eq(userCompanies.id, m.id));
	});
}

export async function removeMember(companyId: string, userId: string): Promise<void> {
	await db.transaction(async (tx) => {
		const m = await membership(tx, companyId, userId);
		await assertNotLastAdmin(tx, companyId, m.role);
		await tx.delete(userCompanies).where(eq(userCompanies.id, m.id));
	});
}

export async function setSuperAdmin(actorId: string, userId: string, value: boolean): Promise<void> {
	if (actorId === userId) throw new ApiError(409, 'cannot_change_self', 'Anda tidak dapat mengubah status super admin diri sendiri');
	const updated = await db.update(user).set({ isSuperAdmin: value }).where(eq(user.id, userId)).returning({ id: user.id });
	if (updated.length === 0) throw notFound('Pengguna');
}
```

- [ ] **Step 4: Service akun (tambahan) & rules**

Tambahkan ke `app/src/lib/server/accounts/service.ts`:
```ts
export const UpdateAccountInput = z.object({
	code: z.string().trim().min(1).max(20).optional(),
	name: z.string().trim().min(1).max(200).optional(),
	normalBal: z.enum(['DEBIT', 'CREDIT']).optional(),
	cashFlowCat: z.enum(['OPERATING', 'INVESTING', 'FINANCING']).nullable().optional(),
	isActive: z.boolean().optional()
});
export type UpdateAccountInput = z.infer<typeof UpdateAccountInput>;

export async function updateAccount(companyId: string, accountId: string, input: UpdateAccountInput): Promise<void> {
	try {
		const updated = await db
			.update(accounts)
			.set(input)
			.where(and(eq(accounts.id, accountId), eq(accounts.companyId, companyId)))
			.returning({ id: accounts.id });
		if (updated.length === 0) throw new ApiError(404, 'not_found', 'Akun tidak ditemukan');
	} catch (e) {
		if (isUniqueViolation(e)) throw new ApiError(409, 'duplicate_code', `Kode akun ${input.code} sudah dipakai`);
		throw e;
	}
}

export async function deactivateAccount(companyId: string, accountId: string): Promise<void> {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (company?.bankAccountId === accountId) {
		throw new ApiError(409, 'bank_account', 'Akun ini dipakai sebagai akun bank perusahaan; ganti dulu di Pengaturan → Perusahaan');
	}
	await updateAccount(companyId, accountId, { isActive: false });
}
```

`app/src/lib/server/rules/service.ts`:
```ts
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertLeafAccount } from '../accounts/queries';
import { ApiError, notFound } from '../api';
import { normalizeKeyword } from '../categorize/rules';
import { db } from '../db';
import { isUniqueViolation } from '../db/errors';
import { accounts, categoryRules } from '../db/schema';

export const CreateRuleInput = z.object({
	keyword: z.string(),
	accountId: z.uuid(),
	direction: z.enum(['DB', 'CR']).nullable().optional(),
	priority: z.number().int().min(0).max(1000).optional()
});
export type CreateRuleInput = z.infer<typeof CreateRuleInput>;

export async function listRules(companyId: string) {
	return db
		.select({
			id: categoryRules.id,
			keywordPattern: categoryRules.keywordPattern,
			direction: categoryRules.direction,
			priority: categoryRules.priority,
			source: categoryRules.source,
			accountId: categoryRules.accountId,
			accountCode: accounts.code,
			accountName: accounts.name,
			accountActive: accounts.isActive
		})
		.from(categoryRules)
		.innerJoin(accounts, eq(accounts.id, categoryRules.accountId))
		.where(eq(categoryRules.companyId, companyId))
		.orderBy(desc(categoryRules.source), desc(categoryRules.priority), asc(categoryRules.keywordPattern));
}

export async function createRule(companyId: string, input: CreateRuleInput): Promise<{ id: string }> {
	const keyword = normalizeKeyword(input.keyword);
	if (!keyword) throw new ApiError(422, 'invalid_keyword', 'Keyword rule minimal 3 karakter');
	await assertLeafAccount(db, companyId, input.accountId);
	try {
		const [row] = await db
			.insert(categoryRules)
			.values({
				companyId,
				keywordPattern: keyword,
				accountId: input.accountId,
				direction: input.direction ?? null,
				priority: input.priority ?? 100,
				source: 'USER'
			})
			.returning({ id: categoryRules.id });
		return row;
	} catch (e) {
		if (isUniqueViolation(e)) throw new ApiError(409, 'duplicate_rule', `Rule dengan keyword "${keyword}" dan arah yang sama sudah ada`);
		throw e;
	}
}

export async function deleteRule(companyId: string, ruleId: string): Promise<void> {
	const deleted = await db
		.delete(categoryRules)
		.where(and(eq(categoryRules.id, ruleId), eq(categoryRules.companyId, companyId)))
		.returning({ id: categoryRules.id });
	if (deleted.length === 0) throw notFound('Rule');
}
```

- [ ] **Step 5: Route**

`app/src/routes/api/companies/+server.ts` (ganti seluruh isi):
```ts
import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { CreateCompanyInput } from '$lib/server/company/service';
import { createCompany } from '$lib/server/company/seed-company';
import { requireSuperAdmin, requireUser } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireUser(event);
		return json({ companies: ctx.companies, activeCompanyId: ctx.companyId });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		requireSuperAdmin(event);
		const input = await parseJson(event.request, CreateCompanyInput);
		return json(await createCompany(input), { status: 201 });
	});
```

`app/src/routes/api/companies/[id]/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler, notFound, parseJson } from '$lib/server/api';
import { UpdateCompanyInput, updateCompany } from '$lib/server/company/service';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		if (event.params.id !== ctx.companyId) throw notFound('Perusahaan');
		await updateCompany(ctx.companyId, await parseJson(event.request, UpdateCompanyInput));
		return json({ ok: true });
	});
```

`app/src/routes/api/users/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { AddMemberInput, addMember, listMembers } from '$lib/server/users/service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		return json({ users: await listMembers(ctx.companyId) });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		return json(await addMember(ctx.companyId, await parseJson(event.request, AddMemberInput)), { status: 201 });
	});
```

`app/src/routes/api/users/[id]/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { removeMember } from '$lib/server/users/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await removeMember(ctx.companyId, parseId(event.params.id, 'Pengguna'));
		return json({ ok: true });
	});
```

`app/src/routes/api/users/[id]/role/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { ChangeRoleInput, changeRole } from '$lib/server/users/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		const { role } = await parseJson(event.request, ChangeRoleInput);
		await changeRole(ctx.companyId, parseId(event.params.id, 'Pengguna'), role);
		return json({ ok: true });
	});
```

`app/src/routes/api/users/[id]/super-admin/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireSuperAdmin } from '$lib/server/rbac';
import { SuperAdminInput, setSuperAdmin } from '$lib/server/users/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireSuperAdmin(event);
		const { value } = await parseJson(event.request, SuperAdminInput);
		await setSuperAdmin(ctx.user.id, parseId(event.params.id, 'Pengguna'), value);
		return json({ ok: true });
	});
```

`app/src/routes/api/accounts/[id]/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { deactivateAccount, UpdateAccountInput, updateAccount } from '$lib/server/accounts/service';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await updateAccount(ctx.companyId, parseId(event.params.id, 'Akun'), await parseJson(event.request, UpdateAccountInput));
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await deactivateAccount(ctx.companyId, parseId(event.params.id, 'Akun'));
		return json({ ok: true });
	});
```

`app/src/routes/api/rules/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { CreateRuleInput, createRule, listRules } from '$lib/server/rules/service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json({ rules: await listRules(ctx.companyId) });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		return json(await createRule(ctx.companyId, await parseJson(event.request, CreateRuleInput)), { status: 201 });
	});
```

`app/src/routes/api/rules/[id]/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { deleteRule } from '$lib/server/rules/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await deleteRule(ctx.companyId, parseId(event.params.id, 'Rule'));
		return json({ ok: true });
	});
```

- [ ] **Step 6: Jalankan semua test**

Run: `cd app && bun run test`
Expected: semua PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src app/tests
git commit -m "feat(app): settings services and APIs for company, members, chart of accounts and rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Halaman Pengaturan (Perusahaan, Pengguna & Role, Chart of Accounts, Category Rules)

**Files:**
- Create: `app/src/routes/(app)/settings/company/+page.server.ts`, `+page.svelte`
- Create: `app/src/routes/(app)/settings/users/+page.server.ts`, `+page.svelte`
- Create: `app/src/routes/(app)/settings/accounts/+page.server.ts`, `+page.svelte`
- Create: `app/src/routes/(app)/settings/rules/+page.server.ts`, `+page.svelte`

**Interfaces:**
- Consumes: `getCompany`, `listMembers`, `listAccounts`, `listLeafAccounts`, `listRules` (Task 10, 17); API Task 12 & 17; `apiFetch`, `selectClass`, `inputClass`, `ROLES`, `ROLE_LABELS`.
- Produces: halaman `/settings/company` (super admin melihat form "Perusahaan baru" bila `?new=1`), `/settings/users`, `/settings/accounts`, `/settings/rules`.

- [ ] **Step 1: Perusahaan**

`app/src/routes/(app)/settings/company/+page.server.ts`:
```ts
import { listLeafAccounts } from '$lib/server/accounts/queries';
import { getCompany } from '$lib/server/company/service';
import { db } from '$lib/server/db';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'admin');
	const [company, leaf] = await Promise.all([getCompany(ctx.companyId), listLeafAccounts(db, ctx.companyId)]);
	return {
		company,
		assetAccounts: leaf.filter((a) => a.type === 'ASSET'),
		showNew: ctx.user.isSuperAdmin && event.url.searchParams.get('new') === '1',
		isSuperAdmin: ctx.user.isSuperAdmin
	};
};
```

`app/src/routes/(app)/settings/company/+page.svelte`:
```svelte
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { apiFetch } from '$lib/api-client';
	import { selectClass } from '$lib/ui';

	let { data } = $props();
	// Nilai awal form diambil sekali dari data (snapshot), lalu diedit lokal.
	const initialForm = () => ({
		name: data.company.name,
		npwp: data.company.npwp ?? '',
		address: data.company.address ?? '',
		bankAccountId: data.company.bankAccountId ?? ''
	});
	let form = $state(initialForm());
	let newName = $state('');
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function run(fn: () => Promise<void>) {
		message = errorMessage = null;
		try {
			await fn();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		}
	}

	const save = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			await apiFetch(`/api/companies/${data.company.id}`, {
				method: 'PATCH',
				json: { name: form.name, npwp: form.npwp || null, address: form.address || null, bankAccountId: form.bankAccountId || null }
			});
			message = 'Data perusahaan disimpan.';
			await invalidateAll();
		});
	};

	const create = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			const res = await apiFetch<{ id: string }>('/api/companies', { method: 'POST', json: { name: newName } });
			await apiFetch('/api/companies/switch', { method: 'POST', json: { companyId: res.id } });
			await invalidateAll();
			await goto('/settings/company');
		});
	};
</script>

<PageHeader title="Perusahaan" />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

{#if data.showNew}
	<Card.Root class="mb-6 max-w-xl">
		<Card.Header><Card.Title>Perusahaan baru</Card.Title><Card.Description>CoA PSAK dan rule default akan dibuat otomatis.</Card.Description></Card.Header>
		<Card.Content>
			<form class="flex gap-2" onsubmit={create}>
				<Input bind:value={newName} placeholder="PT Nama Perusahaan" required />
				<Button type="submit">Buat</Button>
			</form>
		</Card.Content>
	</Card.Root>
{/if}

<Card.Root class="max-w-xl">
	<Card.Content class="pt-6">
		<form class="space-y-4" onsubmit={save}>
			<div class="space-y-1"><Label for="c-name">Nama</Label><Input id="c-name" bind:value={form.name} required /></div>
			<div class="space-y-1"><Label for="c-npwp">NPWP</Label><Input id="c-npwp" bind:value={form.npwp} maxlength={20} /></div>
			<div class="space-y-1"><Label for="c-addr">Alamat</Label><Input id="c-addr" bind:value={form.address} /></div>
			<div class="space-y-1">
				<Label for="c-bank">Akun bank (lawan jurnal eStatement)</Label>
				<select id="c-bank" class={selectClass} bind:value={form.bankAccountId}>
					<option value="">— belum diatur —</option>
					{#each data.assetAccounts as a (a.id)}<option value={a.id}>{a.code} {a.name}</option>{/each}
				</select>
			</div>
			<Button type="submit">Simpan</Button>
		</form>
	</Card.Content>
</Card.Root>
```

- [ ] **Step 2: Pengguna & Role**

`app/src/routes/(app)/settings/users/+page.server.ts`:
```ts
import { requirePageRole } from '$lib/server/rbac';
import { listMembers } from '$lib/server/users/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'admin');
	return { members: await listMembers(ctx.companyId), me: ctx.user.id, isSuperAdmin: ctx.user.isSuperAdmin };
};
```

`app/src/routes/(app)/settings/users/+page.svelte`:
```svelte
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch } from '$lib/api-client';
	import { ROLE_LABELS, ROLES, type Role } from '$lib/roles';
	import { selectClass } from '$lib/ui';

	let { data } = $props();
	let form = $state({ email: '', name: '', password: '', role: 'viewer' as Role });
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function run(fn: () => Promise<string>) {
		message = errorMessage = null;
		try {
			message = await fn();
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		}
	}

	const add = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			const res = await apiFetch<{ created: boolean }>('/api/users', {
				method: 'POST',
				json: { email: form.email, role: form.role, name: form.name || undefined, password: form.password || undefined }
			});
			form = { email: '', name: '', password: '', role: 'viewer' };
			return res.created ? 'Pengguna baru dibuat dan ditambahkan.' : 'Pengguna yang sudah ada ditambahkan ke perusahaan.';
		});
	};
	const setRole = (userId: string, role: string) =>
		run(async () => {
			await apiFetch(`/api/users/${userId}/role`, { method: 'PATCH', json: { role } });
			return 'Role diperbarui.';
		});
	const remove = (userId: string) =>
		run(async () => {
			await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
			return 'Pengguna dilepas dari perusahaan.';
		});
	const toggleSuper = (userId: string, value: boolean) =>
		run(async () => {
			await apiFetch(`/api/users/${userId}/super-admin`, { method: 'PATCH', json: { value } });
			return value ? 'Dijadikan super admin.' : 'Status super admin dicabut.';
		});
</script>

<PageHeader title="Pengguna & Role" />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<Card.Root class="mb-6">
	<Card.Header>
		<Card.Title>Tambah pengguna</Card.Title>
		<Card.Description>Jika email sudah terdaftar, cukup isi email dan role. Pengguna baru wajib diberi nama dan password awal.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form class="grid gap-2 md:grid-cols-5" onsubmit={add}>
			<Input type="email" placeholder="Email" bind:value={form.email} required />
			<Input placeholder="Nama (pengguna baru)" bind:value={form.name} />
			<Input type="password" placeholder="Password awal (min. 8)" bind:value={form.password} />
			<select class={selectClass} bind:value={form.role} aria-label="Role">
				{#each ROLES as r (r)}<option value={r}>{ROLE_LABELS[r]}</option>{/each}
			</select>
			<Button type="submit">Tambah</Button>
		</form>
	</Card.Content>
</Card.Root>

<Table.Root>
	<Table.Header>
		<Table.Row><Table.Head>Nama</Table.Head><Table.Head>Email</Table.Head><Table.Head>Role</Table.Head><Table.Head></Table.Head></Table.Row>
	</Table.Header>
	<Table.Body>
		{#each data.members as m (m.userId)}
			<Table.Row>
				<Table.Cell>{m.name} {#if m.isSuperAdmin}<Badge variant="secondary">Super admin</Badge>{/if}</Table.Cell>
				<Table.Cell>{m.email}</Table.Cell>
				<Table.Cell>
					<select class="{selectClass} w-36" value={m.role} onchange={(e) => setRole(m.userId, e.currentTarget.value)} aria-label="Role {m.email}">
						{#each ROLES as r (r)}<option value={r}>{ROLE_LABELS[r]}</option>{/each}
					</select>
				</Table.Cell>
				<Table.Cell class="space-x-2 text-right">
					{#if data.isSuperAdmin && m.userId !== data.me}
						<Button size="sm" variant="ghost" onclick={() => toggleSuper(m.userId, !m.isSuperAdmin)}>
							{m.isSuperAdmin ? 'Cabut super admin' : 'Jadikan super admin'}
						</Button>
					{/if}
					<Button size="sm" variant="ghost" onclick={() => remove(m.userId)}>Lepas</Button>
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
```

- [ ] **Step 3: Chart of Accounts**

`app/src/routes/(app)/settings/accounts/+page.server.ts`:
```ts
import { listAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'admin');
	return { accounts: await listAccounts(db, ctx.companyId) };
};
```

`app/src/routes/(app)/settings/accounts/+page.svelte`:
```svelte
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch } from '$lib/api-client';
	import { selectClass } from '$lib/ui';

	let { data } = $props();
	type Account = (typeof data.accounts)[number];

	const depth = $derived.by(() => {
		const byId = new Map(data.accounts.map((a) => [a.id, a]));
		const d = new Map<string, number>();
		for (const a of data.accounts) {
			let n = 0;
			let cur: Account | undefined = a;
			while (cur?.parentId) {
				n++;
				cur = byId.get(cur.parentId);
			}
			d.set(a.id, n);
		}
		return d;
	});

	let form = $state({ code: '', name: '', parentId: '', normalBal: '' });
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function run(fn: () => Promise<string>) {
		message = errorMessage = null;
		try {
			message = await fn();
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		}
	}

	const create = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			await apiFetch('/api/accounts', {
				method: 'POST',
				json: { code: form.code, name: form.name, parentId: form.parentId, normalBal: form.normalBal || undefined }
			});
			form = { code: '', name: '', parentId: '', normalBal: '' };
			return 'Akun dibuat.';
		});
	};
	const patch = (id: string, body: Record<string, unknown>, msg: string) =>
		run(async () => {
			await apiFetch(`/api/accounts/${id}`, { method: 'PATCH', json: body });
			return msg;
		});
	const deactivate = (id: string) =>
		run(async () => {
			await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
			return 'Akun dinonaktifkan.';
		});
</script>

<PageHeader title="Chart of Accounts" description="Akun tidak dihapus, hanya dinonaktifkan. Hanya akun detail (leaf) yang dapat dipakai transaksi." />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<Card.Root class="mb-6">
	<Card.Header><Card.Title>Tambah akun</Card.Title></Card.Header>
	<Card.Content>
		<form class="grid gap-2 md:grid-cols-5" onsubmit={create}>
			<select class={selectClass} bind:value={form.parentId} required aria-label="Akun induk">
				<option value="" disabled>Akun induk…</option>
				{#each data.accounts.filter((a) => a.isActive) as a (a.id)}<option value={a.id}>{a.code} {a.name}</option>{/each}
			</select>
			<Input placeholder="Kode" bind:value={form.code} required />
			<Input placeholder="Nama" bind:value={form.name} required />
			<select class={selectClass} bind:value={form.normalBal} aria-label="Saldo normal">
				<option value="">Saldo normal ikut induk</option>
				<option value="DEBIT">Debit</option>
				<option value="CREDIT">Kredit</option>
			</select>
			<Button type="submit">Tambah</Button>
		</form>
	</Card.Content>
</Card.Root>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Kode</Table.Head><Table.Head>Nama</Table.Head><Table.Head>Tipe</Table.Head><Table.Head>Saldo normal</Table.Head><Table.Head>Arus kas</Table.Head><Table.Head></Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each data.accounts as a (a.id)}
			<Table.Row class={a.isActive ? '' : 'opacity-50'}>
				<Table.Cell class="whitespace-nowrap">{a.code}</Table.Cell>
				<Table.Cell style="padding-left: {(depth.get(a.id) ?? 0) * 1.25 + 0.5}rem" class={a.isLeaf ? '' : 'font-medium'}>
					{a.name} {#if !a.isActive}<Badge variant="outline">Nonaktif</Badge>{/if}
				</Table.Cell>
				<Table.Cell>{a.type}</Table.Cell>
				<Table.Cell>
					<select class="{selectClass} w-28" value={a.normalBal} onchange={(e) => patch(a.id, { normalBal: e.currentTarget.value }, 'Saldo normal diperbarui.')} aria-label="Saldo normal {a.code}">
						<option value="DEBIT">Debit</option><option value="CREDIT">Kredit</option>
					</select>
				</Table.Cell>
				<Table.Cell>
					<select class="{selectClass} w-36" value={a.cashFlowCat ?? ''} onchange={(e) => patch(a.id, { cashFlowCat: e.currentTarget.value || null }, 'Kategori arus kas diperbarui.')} aria-label="Arus kas {a.code}">
						<option value="">—</option><option value="OPERATING">Operasional</option><option value="INVESTING">Investasi</option><option value="FINANCING">Pendanaan</option>
					</select>
				</Table.Cell>
				<Table.Cell class="text-right">
					{#if a.isActive}
						<Button size="sm" variant="ghost" onclick={() => deactivate(a.id)}>Nonaktifkan</Button>
					{:else}
						<Button size="sm" variant="ghost" onclick={() => patch(a.id, { isActive: true }, 'Akun diaktifkan.')}>Aktifkan</Button>
					{/if}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
```

- [ ] **Step 4: Category Rules**

`app/src/routes/(app)/settings/rules/+page.server.ts`:
```ts
import { roleAtLeast } from '$lib/roles';
import { listLeafAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { requirePageRole } from '$lib/server/rbac';
import { listRules } from '$lib/server/rules/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const [rules, accounts] = await Promise.all([listRules(ctx.companyId), listLeafAccounts(db, ctx.companyId)]);
	return { rules, accounts, canDelete: roleAtLeast(ctx.role, 'admin') };
};
```

`app/src/routes/(app)/settings/rules/+page.svelte`:
```svelte
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch } from '$lib/api-client';
	import { selectClass } from '$lib/ui';

	let { data } = $props();
	let form = $state({ keyword: '', accountId: '', direction: '' });
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	const directionLabel = { DB: 'Keluar', CR: 'Masuk' } as const;

	async function run(fn: () => Promise<string>) {
		message = errorMessage = null;
		try {
			message = await fn();
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		}
	}

	const create = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			await apiFetch('/api/rules', {
				method: 'POST',
				json: { keyword: form.keyword, accountId: form.accountId, direction: form.direction || null }
			});
			form = { keyword: '', accountId: '', direction: '' };
			return 'Rule dibuat.';
		});
	};
	const remove = (id: string) =>
		run(async () => {
			await apiFetch(`/api/rules/${id}`, { method: 'DELETE' });
			return 'Rule dihapus.';
		});
</script>

<PageHeader title="Category Rules" description="Keyword dicocokkan (tanpa membedakan huruf besar/kecil) dengan keterangan transaksi. Rule USER selalu diutamakan dibanding SYSTEM." />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<Card.Root class="mb-6">
	<Card.Header><Card.Title>Tambah rule</Card.Title></Card.Header>
	<Card.Content>
		<form class="grid gap-2 md:grid-cols-4" onsubmit={create}>
			<Input placeholder="Keyword (min. 3 karakter)" bind:value={form.keyword} required />
			<select class={selectClass} bind:value={form.accountId} required aria-label="Akun">
				<option value="" disabled>Akun tujuan…</option>
				{#each data.accounts as a (a.id)}<option value={a.id}>{a.code} {a.name}</option>{/each}
			</select>
			<select class={selectClass} bind:value={form.direction} aria-label="Arah">
				<option value="">Masuk & keluar</option><option value="CR">Hanya uang masuk</option><option value="DB">Hanya uang keluar</option>
			</select>
			<Button type="submit">Tambah</Button>
		</form>
	</Card.Content>
</Card.Root>

<Table.Root>
	<Table.Header>
		<Table.Row><Table.Head>Keyword</Table.Head><Table.Head>Arah</Table.Head><Table.Head>Akun</Table.Head><Table.Head>Sumber</Table.Head><Table.Head class="text-right">Prioritas</Table.Head><Table.Head></Table.Head></Table.Row>
	</Table.Header>
	<Table.Body>
		{#each data.rules as r (r.id)}
			<Table.Row>
				<Table.Cell class="font-mono">{r.keywordPattern}</Table.Cell>
				<Table.Cell>{r.direction ? directionLabel[r.direction] : 'Semua'}</Table.Cell>
				<Table.Cell>{r.accountCode} {r.accountName} {#if !r.accountActive}<Badge variant="outline">Akun nonaktif</Badge>{/if}</Table.Cell>
				<Table.Cell><Badge variant={r.source === 'USER' ? 'default' : 'secondary'}>{r.source}</Badge></Table.Cell>
				<Table.Cell class="text-right">{r.priority}</Table.Cell>
				<Table.Cell class="text-right">{#if data.canDelete}<Button size="sm" variant="ghost" onclick={() => remove(r.id)}>Hapus</Button>{/if}</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
```

- [ ] **Step 5: Verifikasi**

Run: `cd app && bun run check`
Expected: 0 errors.
Manual (`bun run dev`, login super admin): `/settings/users` → tambah `akuntan@demo.local` (nama, password, role Akuntan) → logout, login sebagai akuntan → sidebar tidak menampilkan Perusahaan/Pengguna/CoA; membuka `/settings/users` langsung → halaman 403. Login kembali sebagai super admin → "+ Perusahaan baru" → buat "PT Kedua" → switcher berpindah ke PT Kedua dengan CoA terisi.

- [ ] **Step 6: Commit**

```bash
git add app/src
git commit -m "feat(app): settings pages for company, users & roles, chart of accounts and category rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Test matriks RBAC untuk semua endpoint

**Files:**
- Test: `app/tests/integration/rbac-matrix.test.ts`

**Interfaces:**
- Consumes: semua handler `src/routes/api/**/+server.ts` (Task 7–17), `fakeEvent`, `call`, factory.
- Produces: jaminan bahwa matriks akses spec §7 ditegakkan di level endpoint.

- [ ] **Step 1: Tulis test**

`app/tests/integration/rbac-matrix.test.ts`:
```ts
import { beforeAll, describe, expect, test } from 'bun:test';
import * as accounts from '../../src/routes/api/accounts/+server';
import * as accountOne from '../../src/routes/api/accounts/[id]/+server';
import * as companies from '../../src/routes/api/companies/+server';
import * as companyOne from '../../src/routes/api/companies/[id]/+server';
import * as journal from '../../src/routes/api/journal/+server';
import * as journalGenerate from '../../src/routes/api/journal/generate/+server';
import * as opening from '../../src/routes/api/opening-balance/+server';
import * as ledger from '../../src/routes/api/reports/ledger/+server';
import * as trialBalance from '../../src/routes/api/reports/trial-balance/+server';
import * as rules from '../../src/routes/api/rules/+server';
import * as ruleOne from '../../src/routes/api/rules/[id]/+server';
import * as txns from '../../src/routes/api/transactions/+server';
import * as bulk from '../../src/routes/api/transactions/bulk-confirm/+server';
import * as confirm from '../../src/routes/api/transactions/[id]/confirm/+server';
import * as uploads from '../../src/routes/api/uploads/+server';
import * as uploadOne from '../../src/routes/api/uploads/[id]/+server';
import * as categorize from '../../src/routes/api/uploads/[id]/categorize/+server';
import * as users from '../../src/routes/api/users/+server';
import * as userOne from '../../src/routes/api/users/[id]/+server';
import * as userRole from '../../src/routes/api/users/[id]/role/+server';
import * as superAdmin from '../../src/routes/api/users/[id]/super-admin/+server';
import type { AppContext } from '../../src/lib/server/rbac';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

type Level = 'viewer' | 'accountant' | 'admin' | 'super';
type H = (e: never) => Response | Promise<Response>;
const RID = '00000000-0000-4000-8000-000000000000';

const ENDPOINTS: Array<{ name: string; handler: H; method: string; min: Level; body?: unknown; form?: boolean; params?: Record<string, string> }> = [
	{ name: 'GET /uploads', handler: uploads.GET, method: 'GET', min: 'viewer' },
	{ name: 'POST /uploads', handler: uploads.POST, method: 'POST', min: 'accountant', form: true },
	{ name: 'GET /uploads/:id', handler: uploadOne.GET, method: 'GET', min: 'viewer', params: { id: RID } },
	{ name: 'DELETE /uploads/:id', handler: uploadOne.DELETE, method: 'DELETE', min: 'admin', params: { id: RID } },
	{ name: 'POST /uploads/:id/categorize', handler: categorize.POST, method: 'POST', min: 'accountant', params: { id: RID } },
	{ name: 'GET /transactions', handler: txns.GET, method: 'GET', min: 'viewer' },
	{ name: 'PATCH /transactions/:id/confirm', handler: confirm.PATCH, method: 'PATCH', min: 'accountant', params: { id: RID }, body: { accountId: RID } },
	{ name: 'POST /transactions/bulk-confirm', handler: bulk.POST, method: 'POST', min: 'accountant', body: { uploadId: RID } },
	{ name: 'GET /accounts', handler: accounts.GET, method: 'GET', min: 'viewer' },
	{ name: 'POST /accounts', handler: accounts.POST, method: 'POST', min: 'accountant', body: {} },
	{ name: 'PATCH /accounts/:id', handler: accountOne.PATCH, method: 'PATCH', min: 'admin', params: { id: RID }, body: {} },
	{ name: 'DELETE /accounts/:id', handler: accountOne.DELETE, method: 'DELETE', min: 'admin', params: { id: RID } },
	{ name: 'GET /rules', handler: rules.GET, method: 'GET', min: 'viewer' },
	{ name: 'POST /rules', handler: rules.POST, method: 'POST', min: 'accountant', body: {} },
	{ name: 'DELETE /rules/:id', handler: ruleOne.DELETE, method: 'DELETE', min: 'admin', params: { id: RID } },
	{ name: 'POST /journal/generate', handler: journalGenerate.POST, method: 'POST', min: 'accountant', body: { uploadId: RID } },
	{ name: 'GET /journal', handler: journal.GET, method: 'GET', min: 'viewer' },
	{ name: 'GET /reports/ledger', handler: ledger.GET, method: 'GET', min: 'viewer' },
	{ name: 'GET /reports/trial-balance', handler: trialBalance.GET, method: 'GET', min: 'viewer' },
	{ name: 'GET /opening-balance', handler: opening.GET, method: 'GET', min: 'viewer' },
	{ name: 'PUT /opening-balance', handler: opening.PUT, method: 'PUT', min: 'accountant', body: {} },
	{ name: 'GET /users', handler: users.GET, method: 'GET', min: 'admin' },
	{ name: 'POST /users', handler: users.POST, method: 'POST', min: 'admin', body: {} },
	{ name: 'PATCH /users/:id/role', handler: userRole.PATCH, method: 'PATCH', min: 'admin', params: { id: RID }, body: { role: 'viewer' } },
	{ name: 'DELETE /users/:id', handler: userOne.DELETE, method: 'DELETE', min: 'admin', params: { id: RID } },
	{ name: 'PATCH /companies/:id', handler: companyOne.PATCH, method: 'PATCH', min: 'admin', params: { id: RID }, body: {} },
	{ name: 'POST /companies', handler: companies.POST, method: 'POST', min: 'super', body: {} },
	{ name: 'PATCH /users/:id/super-admin', handler: superAdmin.PATCH, method: 'PATCH', min: 'super', params: { id: RID }, body: { value: true } }
];

const ORDER: Level[] = ['viewer', 'accountant', 'admin', 'super'];
const ctxs = {} as Record<Level, AppContext>;

beforeAll(async () => {
	await resetDb();
	const { companyId } = await makeCompany();
	for (const level of ['viewer', 'accountant', 'admin'] as const) {
		const u = await makeUser();
		await addMember(u.id, companyId, level);
		ctxs[level] = await contextFor(u);
	}
	ctxs.super = await contextFor(await makeUser({ isSuperAdmin: true }));
});

function event(ep: (typeof ENDPOINTS)[number], ctx: AppContext | null) {
	return fakeEvent({
		ctx,
		method: ep.method,
		params: ep.params,
		body: ep.form ? undefined : ep.body,
		form: ep.form ? new FormData() : undefined,
		path: '/api/x'
	});
}

describe('RBAC matrix', () => {
	for (const ep of ENDPOINTS) {
		test(ep.name, async () => {
			expect((await call(ep.handler, event(ep, null))).status).toBe(401);
			for (const level of ORDER) {
				const { status } = await call(ep.handler, event(ep, ctxs[level]));
				const allowed = ORDER.indexOf(level) >= ORDER.indexOf(ep.min);
				if (allowed) expect({ level, status }).not.toEqual({ level, status: 403 });
				else expect({ level, status }).toEqual({ level, status: 403 });
			}
		});
	}
});
```
(Untuk role yang diizinkan, status apa pun selain 401/403 diterima, misalnya 400 karena body sengaja kosong, atau 404 karena ID acak. Yang diuji hanya otorisasi.)

- [ ] **Step 2: Jalankan**

Run: `cd app && bun test tests/integration/rbac-matrix.test.ts`
Expected: 28 PASS. Bila ada yang gagal, perbaiki `requireRole`/`requireSuperAdmin` di handler terkait agar sesuai matriks spec §7, **bukan** mengubah tabel `ENDPOINTS`.

- [ ] **Step 3: Commit**

```bash
git add app/tests/integration/rbac-matrix.test.ts
git commit -m "test(app): endpoint-level RBAC matrix

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Docker Compose lengkap, Dockerfile app, Ollama, README

**Files:**
- Create: `app/Dockerfile`, `app/.dockerignore`, `ollama/entrypoint.sh`, `.env.example`, `README.md`, `LICENSE`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `bun run build` (Task 3), `src/lib/server/db/migrate.ts` (Task 4), `seeds/index.ts` (Task 5), sidecar Dockerfile (Task 2).
- Produces: `docker compose up -d` menjalankan `app` (port 3000), `sidecar`, `db`, `ollama`; seed lewat `docker compose exec app bun run db:seed`.

- [ ] **Step 1: Dockerfile app**

`app/Dockerfile`:
```dockerfile
FROM oven/bun:1.3.10 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bunx svelte-kit sync && bun run build

FROM oven/bun:1.3.10
WORKDIR /app
ENV NODE_ENV=production PORT=3000 BODY_SIZE_LIMIT=11M IDLE_TIMEOUT=120
COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/seeds ./seeds
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
CMD ["sh", "-c", "bun run src/lib/server/db/migrate.ts && exec bun ./build/index.js"]
```

`app/.dockerignore`:
```
node_modules
.svelte-kit
build
.env
.env.*
tests
test-results
playwright-report
```

- [ ] **Step 2: Ollama entrypoint**

`ollama/entrypoint.sh`:
```sh
#!/bin/sh
# Jalankan server Ollama lalu pastikan model tersedia (pull sekali, tersimpan di volume).
set -e
ollama serve &
pid=$!
until ollama list >/dev/null 2>&1; do sleep 1; done
if ! ollama list | awk 'NR>1 {print $1}' | grep -qx "${OLLAMA_MODEL}"; then
  echo "Menarik model ${OLLAMA_MODEL} (sekali saja)..."
  ollama pull "${OLLAMA_MODEL}"
fi
wait "$pid"
```
Run: `chmod +x ollama/entrypoint.sh`

- [ ] **Step 3: Compose lengkap dan env**

`docker-compose.yml` (ganti seluruh isi):
```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: jurnalku
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-jurnalku}
      POSTGRES_DB: jurnalku
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/db-init:/docker-entrypoint-initdb.d:ro
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jurnalku"]
      interval: 5s
      retries: 10

  sidecar:
    build: ./sidecar
    restart: unless-stopped
    ports:
      - "127.0.0.1:8000:8000"

  ollama:
    image: ollama/ollama:0.34.4
    restart: unless-stopped
    entrypoint: ["/bin/sh", "/entrypoint.sh"]
    environment:
      OLLAMA_MODEL: ${OLLAMA_MODEL:-qwen2.5:7b}
    volumes:
      - ollama:/root/.ollama
      - ./ollama/entrypoint.sh:/entrypoint.sh:ro
    ports:
      - "127.0.0.1:11434:11434"

  app:
    build: ./app
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      sidecar:
        condition: service_started
      ollama:
        condition: service_started
    environment:
      DATABASE_URL: postgres://jurnalku:${POSTGRES_PASSWORD:-jurnalku}@db:5432/jurnalku
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET wajib diisi di .env}
      BETTER_AUTH_URL: ${APP_ORIGIN:-http://localhost:3000}
      ORIGIN: ${APP_ORIGIN:-http://localhost:3000}
      SIDECAR_URL: http://sidecar:8000
      OLLAMA_URL: http://ollama:11434
      OLLAMA_MODEL: ${OLLAMA_MODEL:-qwen2.5:7b}
      SEED_ADMIN_EMAIL: ${SEED_ADMIN_EMAIL:-admin@jurnalku.local}
      SEED_ADMIN_PASSWORD: ${SEED_ADMIN_PASSWORD:-}
    ports:
      - "3000:3000"

volumes:
  pgdata:
  ollama:
```

`.env.example`:
```
# Salin ke .env lalu isi nilainya. File .env tidak boleh di-commit.
POSTGRES_PASSWORD=ganti-password-db
BETTER_AUTH_SECRET=isi-dengan-hasil-openssl-rand-hex-32
APP_ORIGIN=http://localhost:3000
OLLAMA_MODEL=qwen2.5:7b
SEED_ADMIN_EMAIL=admin@jurnalku.local
SEED_ADMIN_PASSWORD=ganti-password-admin
```

- [ ] **Step 4: README dan LICENSE**

`README.md`:
````markdown
# Jurnalku

Pembukuan otomatis dari eStatement BCA (PDF): parse → kategorisasi (rule + AI lokal) → jurnal double-entry → Buku Besar → Neraca Saldo. Open source, self-hosted, multi-perusahaan, multi-user dengan RBAC.

AI berjalan **lokal** lewat Ollama (`qwen2.5:7b`). Data transaksi tidak pernah dikirim ke layanan pihak ketiga, dan file PDF tidak disimpan setelah diproses.

## Menjalankan dengan Docker

```bash
cp .env.example .env          # isi BETTER_AUTH_SECRET (openssl rand -hex 32) dan password
docker compose up -d          # pertama kali: Ollama menarik model ±4.7 GB
docker compose exec app bun run db:seed
```

Buka http://localhost:3000 lalu login dengan `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

## Pengembangan

Prasyarat: Bun 1.3, Python 3.12+, Docker.

```bash
docker compose up -d db sidecar ollama
cd app
cp .env.example .env          # isi BETTER_AUTH_SECRET dan SEED_ADMIN_PASSWORD
bun install
bun run db:migrate && bun run db:seed
bun run dev                   # http://localhost:5173
```

### Test

```bash
# Sidecar (parser PDF)
cd sidecar && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/pytest

# App: unit + integration (butuh Postgres dari docker compose; memakai DB jurnalku_test)
cd app && bun run test

# E2E (butuh `docker compose up -d db sidecar`)
cd app && bunx playwright install chromium && bun run test:e2e
```

### Sample eStatement

Letakkan eStatement BCA asli di `sample/` untuk pengujian parser lokal (`sidecar/tests/test_parser_sample.py`). Folder `sample/`, `samples/`, dan semua file `*.pdf` di-gitignore. **Jangan commit data keuangan.**

## Lisensi

MIT
````

`LICENSE`: isi teks lisensi MIT standar dengan baris `Copyright (c) 2026 Jurnalku contributors`.

- [ ] **Step 5: Verifikasi stack**

Run:
```bash
cp .env.example .env   # isi BETTER_AUTH_SECRET dan SEED_ADMIN_PASSWORD
docker compose build
docker compose up -d
docker compose exec app bun run db:seed
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login
git status --short | grep -E '\.env$|\.pdf$' || echo "aman: .env dan pdf tidak terlacak"
```
Expected: build sukses; seed mencetak `Seed selesai`; `200`; baris terakhir `aman: ...`. Login lewat browser, lalu upload PDF sintetis dan pastikan saran AI muncul setelah model selesai ditarik (`docker compose logs -f ollama`).

- [ ] **Step 6: Commit**

```bash
git add app/Dockerfile app/.dockerignore ollama docker-compose.yml .env.example README.md LICENSE
git commit -m "chore: full docker compose stack, app image, ollama bootstrap and README

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: E2E smoke test (Playwright)

**Files:**
- Create: `app/playwright.config.ts`, `app/tests/e2e/global-setup.ts`, `app/tests/e2e/reset-db.ts`, `app/tests/e2e/ollama-stub.ts`, `app/tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: sidecar di `http://localhost:8000` (`docker compose up -d db sidecar`), `sidecar/.venv` + `sidecar/tests/make_fixture.py` (Task 1), `resetDb` (Task 4), `runSeed` (Task 5), build app (Task 3), teks UI dari Task 14–16.
- Produces: `bun run test:e2e` hijau = alur login → upload → review → jurnal → Neraca Saldo bekerja end-to-end.

- [ ] **Step 1: Stub Ollama, reset DB, global setup**

`app/tests/e2e/ollama-stub.ts`:
```ts
// Pengganti Ollama untuk E2E: CR → 4-2001, DB → 5-3003, confidence 0.9, tanpa keyword.
Bun.serve({
	port: 11999,
	async fetch(req) {
		const body = (await req.json()) as { messages: { content: string }[] };
		const prompt = body.messages.at(-1)?.content ?? '';
		const match = prompt.match(/\[\{"group_id".*\}\]/);
		const groups = match ? (JSON.parse(match[0]) as { group_id: string; arah: string }[]) : [];
		const results = groups.map((g) => ({
			group_id: g.group_id,
			account_code: g.arah === 'CR' ? '4-2001' : '5-3003',
			confidence: 0.9,
			reason: 'stub e2e',
			keyword: null
		}));
		return Response.json({ message: { content: JSON.stringify({ results }) } });
	}
});
console.log('Ollama stub listening on 11999');
```

`app/tests/e2e/reset-db.ts`:
```ts
import { runSeed } from '../../seeds/index';
import { client } from '../../src/lib/server/db';
import { resetDb } from '../integration/db';

await resetDb();
await runSeed();
await client.end();
```

`app/tests/e2e/global-setup.ts`:
```ts
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { E2E_ENV, FIXTURE_PDF } from '../../playwright.config';

export default async function globalSetup() {
	execFileSync('bun', ['run', 'tests/e2e/reset-db.ts'], { env: { ...process.env, ...E2E_ENV }, stdio: 'inherit' });
	mkdirSync('tests/e2e/.tmp', { recursive: true });
	execFileSync('../sidecar/.venv/bin/python', ['-I', '../sidecar/tests/make_fixture.py', FIXTURE_PDF], { stdio: 'inherit' });
}
```

- [ ] **Step 2: Konfigurasi Playwright**

`app/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export const FIXTURE_PDF = 'tests/e2e/.tmp/statement-sintetis.pdf';
export const E2E_PASSWORD = 'e2e-password-123';
const PORT = 4173;

export const E2E_ENV: Record<string, string> = {
	DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://jurnalku:jurnalku@localhost:5432/jurnalku_test',
	BETTER_AUTH_SECRET: 'e2e-secret-0123456789-e2e-secret-0123456789',
	BETTER_AUTH_URL: `http://localhost:${PORT}`,
	ORIGIN: `http://localhost:${PORT}`,
	PORT: String(PORT),
	BODY_SIZE_LIMIT: '11M',
	SIDECAR_URL: 'http://localhost:8000',
	OLLAMA_URL: 'http://localhost:11999',
	OLLAMA_MODEL: 'stub',
	SEED_ADMIN_EMAIL: 'admin@jurnalku.local',
	SEED_ADMIN_PASSWORD: E2E_PASSWORD
};

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: /.*\.spec\.ts/,
	globalSetup: './tests/e2e/global-setup.ts',
	timeout: 90_000,
	use: { baseURL: `http://localhost:${PORT}` },
	webServer: [
		{ command: 'bun tests/e2e/ollama-stub.ts', port: 11999, reuseExistingServer: false },
		{
			command: 'bun run build && bun ./build/index.js',
			port: PORT,
			env: E2E_ENV,
			timeout: 180_000,
			reuseExistingServer: false
		}
	]
});
```

- [ ] **Step 3: Skenario smoke**

`app/tests/e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { E2E_PASSWORD, FIXTURE_PDF } from '../../playwright.config';

test('login → upload → review → journal → balanced trial balance', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	await page.goto('/uploads/new');
	await page.locator('input[type=file]').setInputFiles(FIXTURE_PDF);
	await page.getByRole('button', { name: 'Unggah' }).click();
	await expect(page).toHaveURL(/\/uploads\/[0-9a-f-]{36}$/);
	const detailUrl = page.url();
	await expect(page.getByText('Perlu review')).toBeVisible({ timeout: 30_000 });

	await page.goto('/review');
	await page.getByRole('button', { name: /Konfirmasi semua saran/ }).click();
	await expect(page.getByText('Tidak ada transaksi yang menunggu konfirmasi.')).toBeVisible();

	await page.goto(detailUrl);
	await page.getByRole('button', { name: 'Generate Jurnal' }).click();
	await expect(page.getByText('5 jurnal dibuat')).toBeVisible();

	await page.goto('/trial-balance?as_of=2026-08-31');
	await expect(page.getByText('Balance', { exact: true })).toBeVisible();
});
```

- [ ] **Step 4: Jalankan**

Run:
```bash
docker compose up -d db sidecar
cd app && bunx playwright install chromium && bun run test:e2e
```
Expected: `1 passed`. (Integration test dan E2E sama-sama memakai `jurnalku_test`; jangan jalankan bersamaan.)

- [ ] **Step 5: Jalankan seluruh suite sebagai verifikasi akhir**

Run:
```bash
(cd sidecar && .venv/bin/pytest -q)
(cd app && bun run check && bun run test && bun run test:e2e)
git status --short
```
Expected: semua hijau; `git status` tidak menampilkan file `.pdf`, `.env`, atau `sample/`.

- [ ] **Step 6: Commit**

```bash
git add app/playwright.config.ts app/tests/e2e
git commit -m "test(app): end-to-end smoke test from login to balanced trial balance

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
