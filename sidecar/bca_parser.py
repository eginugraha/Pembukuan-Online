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
