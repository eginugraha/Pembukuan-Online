# Tambahan konfigurasi nginx-proxy

Dua file di sini disalin ke folder yang di-mount ke `/etc/nginx/vhost.d` pada container `nginx-proxy`
(di server: `./nginx/vhost/`). Namanya harus sama dengan `APP_DOMAIN`:

| File contoh | Salin sebagai | Isi |
|---|---|---|
| `server.conf` | `./nginx/vhost/<APP_DOMAIN>` | batas upload 11 MB + header keamanan (blok server) |
| `location.conf` | `./nginx/vhost/<APP_DOMAIN>_location` | timeout baca 130 dtk untuk parsing PDF/AI (blok location) |

Lalu `docker exec nginx-proxy nginx -s reload` (atau recreate container-nya).
Tanpa `server.conf`, nginx menolak upload eStatement di atas 1 MB.
