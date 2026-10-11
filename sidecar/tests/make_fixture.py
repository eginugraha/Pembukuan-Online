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
