-- Samakan dengan normalizeAccountNo(): simpan nomor rekening hanya digit agar cek duplikat statement konsisten.
UPDATE "statement_uploads"
SET "account_no" = regexp_replace("account_no", '\D', '', 'g')
WHERE "account_no" ~ '\D' AND regexp_replace("account_no", '\D', '', 'g') <> '';
