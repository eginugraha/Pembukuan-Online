# Pembukuan Online

Pembukuan otomatis dari eStatement BCA (PDF): parse → kategorisasi (rule + AI lokal) → jurnal double-entry → Buku Besar → Neraca Saldo. Open source, self-hosted, multi-perusahaan, multi-user dengan RBAC.

AI berjalan **lokal** lewat Ollama (`qwen2.5:7b`). Data transaksi tidak pernah dikirim ke layanan pihak ketiga, dan file PDF eStatement hanya disimpan di server Anda sendiri (volume `uploads`) untuk fitur preview.

## Menjalankan dengan Docker

```bash
cp .env.example .env          # isi BETTER_AUTH_SECRET (openssl rand -hex 32) dan password
docker compose up -d          # pertama kali: Ollama menarik model ±4.7 GB
docker compose exec app bun run db:seed
```

Buka http://localhost:3000 lalu login dengan `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

### Produksi

- Dengan `nginxproxy/nginx-proxy` + `acme-companion`: isi `APP_DOMAIN`, `PROXY_NETWORK`, dan `APP_ORIGIN=https://domain-anda` di `.env`, salin dua file di `deploy/nginx-proxy/` (lihat README di sana), lalu jalankan `docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build`. App tidak membuka port ke host; sertifikat HTTPS diurus acme-companion.
- Ganti `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, dan `SEED_ADMIN_PASSWORD` dengan nilai acak yang kuat.
- Backup database dan volume `uploads` (PDF eStatement asli).

## Pengembangan

Prasyarat: Bun 1.3, Python 3.12+, Docker.

```bash
cp .env.example .env          # satu-satunya file env (dibaca Docker dan skrip app); isi BETTER_AUTH_SECRET dan SEED_ADMIN_PASSWORD
cd app
bun install
bun run db:migrate && bun run db:seed
bun run dev                   # http://localhost:5173
```

### Test

```bash
# Sidecar (parser PDF)
cd sidecar && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/pytest

# App: unit + integration (butuh Postgres dari docker compose; memakai DB pembukuan_test)
cd app && bun run test

# E2E (butuh `docker compose up -d db sidecar`)
cd app && bunx playwright install chromium && bun run test:e2e
```

### Sample eStatement

Letakkan eStatement BCA asli di `sample/` untuk pengujian parser lokal (`sidecar/tests/test_parser_sample.py`). Folder `sample/`, `samples/`, dan semua file `*.pdf` di-gitignore. **Jangan commit data keuangan.**

## Lisensi
 
Didistribusikan di bawah lisensi MIT. Lihat berkas `LICENSE` untuk detail.
 
## Maintainer
 
Dikelola oleh [Sabio](https://sabio.co.id/), perusahaan pengembang perangkat lunak di Bandung.
