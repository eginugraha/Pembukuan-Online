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
