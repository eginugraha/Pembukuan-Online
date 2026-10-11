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
