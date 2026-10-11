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
