# Ganti Template Bagan Akun Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin bisa memindahkan perusahaan yang sudah berjalan ke template CoA lain lewat layar review 3 langkah, tanpa mengubah data transaksi historis.

**Architecture:** Satu modul murni yang aman dipakai client (`src/lib/coa-template-diff.ts`) menghitung perbedaan CoA perusahaan vs template (`diffTemplate`) dan mengubah keputusan pengguna menjadi rencana perubahan (`buildChangePlan`, sekaligus validasi dan peringatan nama ganda). Server (`src/lib/server/company/change-template.ts`) mengambil snapshot CoA + fingerprint, lalu menjalankan rencana dalam satu `db.transaction` dengan cek fingerprint (409 bila CoA berubah). Halaman `/settings/company/coa-template` memakai fungsi murni yang sama untuk ringkasan dan peringatan langsung.

**Tech Stack:** SvelteKit + Svelte 5 runes, Drizzle ORM/Postgres, Zod 4, Bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-change-coa-template-design.md`

## Global Constraints

- Tidak ada migrasi skema. Tidak ada kolom baru di `companies` (template asal tidak disimpan).
- Tidak ada akun yang dihapus. Akun hanya di-rename, diaktifkan/dinonaktifkan, atau ditambah.
- Tidak ada baris di `journal_lines`, `transactions`, `invoices`, dll. yang diubah. `companies.bankAccountId` tidak diubah.
- Semua penulisan dalam satu `db.transaction`, diawali `select id from companies where id = $1 for update` (pola `updateAccount`).
- Role: `admin` (`requireRole(event, 'admin')` / `requirePageRole(event, 'admin')`), hanya untuk `ctx.companyId`.
- Pencocokan selalu berdasarkan **kode**. Tidak ada pencocokan nama otomatis.
- Rule kategorisasi lama tidak diubah/dihapus. Rule baru: `source: 'SYSTEM'`, `priority: 0`, `.onConflictDoNothing()` (unique `category_rules_company_keyword_direction_uq`).
- Teks UI dalam Bahasa Indonesia. Pesan error service dalam Bahasa Indonesia seperti modul lain.

## Review Focus

- CoA berubah antara preview dan Terapkan (pengguna lain menambah akun) → 409 `coa_changed`, tidak ada yang berubah → Task 3 `apply rejects stale fingerprint`.
- Akun bentrok yang tipe/saldo normalnya berbeda dan sudah berjurnal (`4-1003`) dikirim dengan `action: 'rename'` lewat API langsung (melewati UI) → 422, saldo normal tidak berubah → Task 2 `rename blocked when balance differs and journals exist` + Task 3.
- Akun baru yang induknya dilewati (`1-3100` di-skip, `1-3101` tidak) → 422, bukan insert dengan induk null → Task 2 `child addition requires parent`.
- Akun bawaan yang kodenya bentrok dengan akun **buatan pengguna** yang leaf dan sudah berjurnal, lalu template ingin menaruh anak di bawahnya → addition ditandai `blocked`, tidak bisa dipilih (aturan `parent_in_use` dari `createAccount`) → Task 1 `addition under used leaf is blocked`.
- Menonaktifkan akun bank perusahaan atau induk yang anaknya tetap aktif → 422 → Task 2 `deactivate guards`.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| Create `src/lib/coa-template-diff.ts` | Tipe + fungsi murni `diffTemplate`, `nextFreeCode`, `buildChangePlan`, `PlanError`. Aman diimpor client (hanya `import type` dari server). |
| Modify `src/lib/schemas/company.ts` | `ChangeTemplateInput` (Zod) + tipe. |
| Create `src/lib/server/company/change-template.ts` | `loadSnapshot`, `previewTemplateChange`, `applyTemplateChange`. |
| Create `src/routes/api/companies/[id]/coa-template/+server.ts` | `GET ?target=` preview, `POST` apply. |
| Create `src/routes/(app)/settings/company/coa-template/+page.server.ts`, `+page.svelte` | Layar review bertahap (layout B). |
| Modify `src/routes/(app)/settings/company/+page.svelte` | Tombol "Ganti template bagan akun". |
| Tests | `tests/unit/coa-template-diff.test.ts`, `tests/integration/change-template.test.ts`, `tests/integration/change-template-api.test.ts`, `tests/e2e/change-template.spec.ts` |

---

### Task 1: `diffTemplate` dan `nextFreeCode`

**Files:**
- Create: `src/lib/coa-template-diff.ts`
- Test: `tests/unit/coa-template-diff.test.ts`

**Interfaces:**
- Produces:

```ts
import type { CoaSeed } from './server/company/coa-data';
import type { CoaTemplateId } from './coa-templates';
type AccountType = CoaSeed['type'];
type NormalBal = CoaSeed['normalBal'];

export interface CompanyAccountSnap {
	id: string; code: string; name: string; type: AccountType; normalBal: NormalBal;
	parentCode: string | null; isActive: boolean;
	hasChildren: boolean; hasActiveChildren: boolean;
	journalLines: number; inUse: boolean; // inUse = accountInUse() (jurnal/transaksi/rule/bank)
	isBankAccount: boolean;
}
export interface ConflictItem {
	code: string; accountId: string;
	current: { name: string; type: AccountType; normalBal: NormalBal; parentCode: string | null; isActive: boolean };
	target: { name: string; type: AccountType; normalBal: NormalBal; parentCode: string | null };
	journalLines: number;
	isHeader: boolean;        // akun perusahaan punya anak ATAU kode ini induk di template
	nameDiffers: boolean;     // nama/tipe/saldo normal/kode induk berbeda
	renameAllowed: boolean;   // false bila (tipe ATAU saldo normal beda) DAN journalLines > 0
	newCodeIfKept: string | null; // hanya untuk leaf dengan nameDiffers; null untuk header / sekadar nonaktif
}
export interface MissingItem {
	accountId: string; code: string; name: string; parentCode: string | null;
	journalLines: number; isBankAccount: boolean;
}
export interface AdditionItem {
	templateCode: string; code: string; // code = templateCode, atau newCodeIfKept untuk sumber 'kept'
	name: string; type: AccountType; normalBal: NormalBal;
	parentCode: string | null; // kode induk di CoA perusahaan setelah penerapan
	source: 'new' | 'kept';
	blocked: 'parent_in_use' | null;
}
export interface TemplateDiff {
	target: CoaTemplateId;
	conflicts: ConflictItem[]; missing: MissingItem[]; additions: AdditionItem[];
	accounts: { code: string; name: string; isActive: boolean }[]; // seluruh CoA saat ini, untuk cek nama ganda
}
export function nextFreeCode(siblingCodes: string[], taken: Set<string>): string;
export function diffTemplate(target: CoaTemplateId, current: CompanyAccountSnap[], coa: CoaSeed[]): TemplateDiff;
```

Aturan pengelompokan (dari spec):
- Kode ada di keduanya, nama/tipe/saldo normal/kode induk sama, aktif → tidak muncul.
- Kode ada di keduanya, ada yang beda **atau** akun nonaktif → `conflicts`.
- Kode hanya di perusahaan dan akun **aktif** → `missing` (akun yang sudah nonaktif tidak ditampilkan).
- Kode hanya di template → `additions` (`source: 'new'`). Leaf conflict dengan `nameDiffers` → juga addition `source: 'kept'` dengan `code = newCodeIfKept`.
- `blocked: 'parent_in_use'` bila `parentCode` menunjuk akun perusahaan yang leaf dan `inUse`.
- Semua list diurutkan berdasarkan kode. Additions diurutkan supaya induk selalu sebelum anak.

`nextFreeCode`: kode berformat `D-DDDD`. Ambil suffix numerik terbesar dari `siblingCodes`, lalu naikkan 1 sampai tidak ada di `taken`. Hasilnya dipad 4 digit. `siblingCodes` = anak akun perusahaan dengan `parentCode` sama + anak template dengan `parent` sama. `taken` = semua kode perusahaan (aktif/nonaktif) ∪ semua kode template ∪ kode baru yang sudah dibagikan sebelumnya (urut kode).

- [ ] **Step 1: Tulis test yang gagal.** Helper `snapFrom(DEFAULT_COA)` di file test membangun `CompanyAccountSnap[]` dari seed (id = `id-${code}`, `journalLines: 0`, `inUse: false`, `isBankAccount: code === '1-1002'`, `hasChildren` dari seed).

```ts
test('Umum → IT: 25 bentrok, 1 missing, 19 akun baru', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	expect(d.conflicts.length).toBe(25);
	expect(d.missing.map((m) => m.code)).toEqual(['1-2105']);
	expect(d.additions.filter((a) => a.source === 'new').length).toBe(19);
});
test('nextFreeCode skips codes the target template will add', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	expect(d.conflicts.find((c) => c.code === '1-2101')!.newCodeIfKept).toBe('1-2106');
	expect(d.conflicts.find((c) => c.code === '4-1003')!.newCodeIfKept).toBe('4-1009'); // 4-1001→4-1007, 4-1002→4-1008 dibagikan lebih dulu
	expect(d.conflicts.find((c) => c.code === '1-2102')!.newCodeIfKept).toBe('1-2107');
});
test('header conflict 5-1000 has no new code and no kept addition', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	const c = d.conflicts.find((x) => x.code === '5-1000')!;
	expect(c.isHeader).toBe(true);
	expect(c.newCodeIfKept).toBeNull();
	expect(d.additions.some((a) => a.templateCode === '5-1000')).toBe(false);
	expect(d.additions.find((a) => a.code === '5-1004')!.parentCode).toBe('5-1000');
});
test('4-1003 rename blocked only when it has journals', () => {
	const snap = snapFrom(DEFAULT_COA);
	expect(diffTemplate('it', snap, IT_COA).conflicts.find((c) => c.code === '4-1003')!.renameAllowed).toBe(true);
	snap.find((a) => a.code === '4-1003')!.journalLines = 2;
	expect(diffTemplate('it', snap, IT_COA).conflicts.find((c) => c.code === '4-1003')!.renameAllowed).toBe(false);
});
test('inactive account with same name appears as conflict without new code', () => {
	const snap = snapFrom(IT_COA);
	snap.find((a) => a.code === '5-2014')!.isActive = false;
	const c = diffTemplate('it', snap, IT_COA).conflicts;
	expect(c).toHaveLength(1);
	expect(c[0]).toMatchObject({ code: '5-2014', nameDiffers: false, newCodeIfKept: null });
});
test('new header 1-3100 comes before its children', () => {
	const codes = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA).additions.map((a) => a.code);
	expect(codes.indexOf('1-3100')).toBeLessThan(codes.indexOf('1-3101'));
});
test('addition under used leaf is blocked', () => {
	const snap = snapFrom(DEFAULT_COA).filter((a) => !a.code.startsWith('1-3'));
	snap.push({ ...snapFrom(DEFAULT_COA).find((a) => a.code === '1-3001')!, id: 'x', code: '1-3100', name: 'Custom', parentCode: '1-0000', hasChildren: false, inUse: true, journalLines: 1 });
	const d = diffTemplate('it', snap, IT_COA);
	expect(d.additions.find((a) => a.code === '1-3101')!.blocked).toBe('parent_in_use');
});
test('identical CoA yields empty diff', () => {
	const d = diffTemplate('general', snapFrom(DEFAULT_COA), DEFAULT_COA);
	expect([d.conflicts, d.missing, d.additions].map((x) => x.length)).toEqual([0, 0, 0]);
});
```

(Untuk test `addition under used leaf`, sesuaikan fixture supaya `1-3000` ada sebagai induk kalau filter menghapusnya. Yang penting assertion-nya.)

- [ ] **Step 2: Jalankan dan pastikan gagal.** `cd app && bun --env-file=../.env test tests/unit/coa-template-diff.test.ts` → FAIL (modul belum ada).
- [ ] **Step 3: Implementasikan** `nextFreeCode` dan `diffTemplate` di `src/lib/coa-template-diff.ts` sesuai aturan di atas. Hanya `import type` dari `./server/...`.
- [ ] **Step 4: Jalankan test** → PASS. Lalu `bun run check` → tanpa error baru.
- [ ] **Step 5: Commit** `feat(app): CoA template diff with collision-free new codes`.

---

### Task 2: `ChangeTemplateInput` dan `buildChangePlan`

**Files:**
- Modify: `src/lib/schemas/company.ts`
- Modify: `src/lib/coa-template-diff.ts`
- Test: `tests/unit/coa-template-diff.test.ts`

**Interfaces:**
- Consumes: `TemplateDiff`, `diffTemplate` (Task 1).
- Produces:

```ts
// schemas/company.ts
export const ChangeTemplateInput = z.object({
	target: z.enum(COA_TEMPLATE_IDS, { error: 'Template bagan akun tidak valid' }),
	fingerprint: z.string().min(1),
	conflicts: z.record(z.string(), z.object({ action: z.enum(['rename', 'keep']), reactivate: z.boolean().default(false) })),
	missing: z.record(z.string(), z.enum(['keep', 'deactivate'])), // key = accountId
	skip: z.array(z.string()).default([]) // templateCode dari additions yang dilewati
});
export type ChangeTemplateInput = z.infer<typeof ChangeTemplateInput>;

// coa-template-diff.ts
export class PlanError extends Error { constructor(public code: string, message: string) }
export interface ChangePlan {
	renames: { accountId: string; name: string; type: AccountType; normalBal: NormalBal; parentCode: string | null }[];
	reactivate: string[]; deactivate: string[]; // accountId
	creates: { code: string; name: string; type: AccountType; normalBal: NormalBal; parentCode: string | null }[]; // induk dulu
	codeMap: Record<string, string | null>; // templateCode → kode di perusahaan setelah apply; null = dilewati
	duplicateNames: string[]; // nama yang dipakai >1 akun aktif setelah apply, urut alfabet
}
export function buildChangePlan(diff: TemplateDiff, decisions: Pick<ChangeTemplateInput, 'conflicts' | 'missing' | 'skip'>): ChangePlan;
```

Aturan:
- Setiap conflict wajib punya keputusan, kalau tidak → `PlanError('incomplete', 'Masih ada akun bentrok yang belum diputuskan')`. Missing tanpa keputusan dianggap `'keep'`.
- `rename` pada `renameAllowed === false` → `PlanError('rename_not_allowed', ...)`.
- `rename` → masuk `renames` memakai nilai `target`. Akun nonaktif yang di-rename atau `reactivate: true` → masuk `reactivate`.
- `keep` pada leaf `nameDiffers` → addition `source: 'kept'` dibuat kecuali `templateCode` ada di `skip`.
- Addition `blocked` → selalu dilewati, apa pun isi `skip`.
- Addition yang dibuat tetapi induknya dilewati → `PlanError('parent_skipped', ...)`.
- `deactivate` pada akun bank → `PlanError('bank_account', ...)`. Pada akun yang punya anak aktif yang tidak ikut dinonaktifkan → `PlanError('active_children', ...)`. Untuk ini, tambahkan `hasActiveChildren` dan daftar `childIds: string[]` ke `MissingItem`, lalu sesuaikan Task 1.
- `codeMap[templateCode]`: kode itu sendiri bila akun sudah ada (sama/rename/keep header), `newCodeIfKept` bila keep leaf dan tidak di-skip, `null` bila di-skip atau blocked.

- [ ] **Step 1: Tulis test yang gagal.** Helper `allRename(diff)` / `allKeep(diff)` membangun `conflicts` untuk semua kode.

```ts
test('all rename: no kept additions, codeMap identity', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	const p = buildChangePlan(d, { conflicts: allRename(d), missing: {}, skip: [] });
	expect(p.renames).toHaveLength(25);
	expect(p.creates).toHaveLength(19);
	expect(p.codeMap['1-2101']).toBe('1-2101');
});
test('keep leaf creates template account under new code', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	const p = buildChangePlan(d, { conflicts: { ...allRename(d), '1-2101': { action: 'keep', reactivate: false } }, missing: {}, skip: [] });
	expect(p.creates.find((c) => c.code === '1-2106')!.name).toBe('Komputer & Laptop');
	expect(p.codeMap['1-2101']).toBe('1-2106');
});
test('incomplete decisions throw', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	expect(() => buildChangePlan(d, { conflicts: {}, missing: {}, skip: [] })).toThrow(PlanError);
});
test('rename blocked when balance differs and journals exist', () => {
	const snap = snapFrom(DEFAULT_COA); snap.find((a) => a.code === '4-1003')!.journalLines = 1;
	const d = diffTemplate('it', snap, IT_COA);
	expect(() => buildChangePlan(d, { conflicts: allRename(d), missing: {}, skip: [] })).toThrow(/rename_not_allowed|saldo/i);
});
test('child addition requires parent', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	expect(() => buildChangePlan(d, { conflicts: allRename(d), missing: {}, skip: ['1-3100'] })).toThrow(PlanError);
	const ok = buildChangePlan(d, { conflicts: allRename(d), missing: {}, skip: ['1-3100', '1-3101', '1-3102', '1-3103'] });
	expect(ok.codeMap['1-3101']).toBeNull();
});
test('duplicate names warned: 1-2103 kept + 1-2104 renamed to Kendaraan', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	const p = buildChangePlan(d, { conflicts: { ...allRename(d), '1-2103': { action: 'keep', reactivate: false } }, missing: {}, skip: [] });
	expect(p.duplicateNames).toContain('Kendaraan');
});
test('deactivate guards', () => {
	const snap = snapFrom(IT_COA); // 1-1002 ada di keduanya, jadi pakai akun bank custom
	snap.push({ ...snap.find((a) => a.code === '1-1002')!, id: 'bank2', code: '1-1099', isBankAccount: true });
	const d = diffTemplate('it', snap, IT_COA);
	expect(() => buildChangePlan(d, { conflicts: {}, missing: { bank2: 'deactivate' }, skip: [] })).toThrow(PlanError);
});
test('ChangeTemplateInput rejects unknown template', () => {
	expect(ChangeTemplateInput.safeParse({ target: 'pabrik', fingerprint: 'x', conflicts: {}, missing: {} }).success).toBe(false);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal.** `bun --env-file=../.env test tests/unit/coa-template-diff.test.ts` → FAIL.
- [ ] **Step 3: Implementasikan** `ChangeTemplateInput`, `PlanError`, `buildChangePlan`. `duplicateNames` dihitung dari `diff.accounts` aktif setelah menerapkan renames/reactivate/deactivate/creates, case-insensitive dan di-trim, tetapi mengembalikan nama aslinya.
- [ ] **Step 4: Jalankan test** → PASS. Lalu `bun run check`.
- [ ] **Step 5: Commit** `feat(app): build CoA template change plan from user decisions`.

---

### Task 3: Service preview & apply

**Files:**
- Create: `src/lib/server/company/change-template.ts`
- Test: `tests/integration/change-template.test.ts`

**Interfaces:**
- Consumes: `diffTemplate`, `buildChangePlan`, `PlanError`, `ChangeTemplateInput` (Task 1–2); `COA_TEMPLATE_DATA` (`./templates`); `accountInUse` (`../accounts/service`).
- Produces:

```ts
export async function loadSnapshot(ex: Executor, companyId: string): Promise<{ accounts: CompanyAccountSnap[]; fingerprint: string }>;
export async function previewTemplateChange(companyId: string, target: CoaTemplateId): Promise<{ diff: TemplateDiff; fingerprint: string }>;
export interface ApplySummary { renamed: number; created: number; deactivated: number; reactivated: number; rulesAdded: number }
export async function applyTemplateChange(companyId: string, input: ChangeTemplateInput): Promise<ApplySummary>;
```

- `loadSnapshot`: satu query akun + hitungan `journal_lines` per akun (group by), `inUse` memakai kriteria yang sama dengan `accountInUse` tetapi dalam query batch (jangan N query). `fingerprint` = sha256 (`node:crypto`) dari baris `id|code|name|type|normalBal|parentId|isActive` yang diurutkan berdasarkan id.
- `applyTemplateChange` dalam `db.transaction`: lock baris company → `loadSnapshot(tx)` → fingerprint beda → `ApiError(409, 'coa_changed', 'Bagan akun berubah sejak review dibuka. Muat ulang halaman.')` → `diffTemplate` → `buildChangePlan` (`PlanError` → `ApiError(422, e.code, e.message)`) → update renames (termasuk `parentId` dari `parentCode`), set `isActive` → insert creates berurutan sambil memperbarui peta `code → id` → rules.
- Rules: untuk setiap rule template, lewati bila `keyword` + `direction` sudah ada (case-insensitive keyword). Kode akun di-resolve lewat `plan.codeMap` (default ke kode itu sendiri bila tidak ada di map). Lewati bila hasilnya `null`, akun tidak ada, atau akun nonaktif setelah apply. Insert dengan `.onConflictDoNothing()`. `rulesAdded` = jumlah baris yang benar-benar ter-insert (`.returning()`).

- [ ] **Step 1: Tulis test yang gagal.** Pakai `makeCompany` (template Umum), `accountIdByCode`, dan helper jurnal yang dipakai test lain (lihat `tests/integration/account-delete.test.ts` untuk cara membuat journal line pada akun tertentu).

```ts
test('apply Umum → IT: renames, adds, keeps journals on same account', async () => {
	const { companyId } = await makeCompany();
	const landId = await accountIdByCode(companyId, '1-2101');
	await postLineOn(companyId, landId); // helper lokal: 1 jurnal seimbang memakai akun ini
	const { diff, fingerprint } = await previewTemplateChange(companyId, 'it');
	const conflicts = Object.fromEntries(diff.conflicts.map((c) => [c.code, { action: c.code === '1-2101' ? 'keep' : 'rename', reactivate: false }]));
	const s = await applyTemplateChange(companyId, { target: 'it', fingerprint, conflicts, missing: {}, skip: [] });
	expect(s).toMatchObject({ renamed: 24, created: 20, deactivated: 0 });
	const land = await db.query.accounts.findFirst({ where: eq(accounts.id, landId) });
	expect(land!.name).toBe('Tanah');
	expect(await accountIdByCode(companyId, '1-2106')).toBeTruthy();
	const lines = await db.select().from(journalLines).where(eq(journalLines.accountId, landId));
	expect(lines.length).toBeGreaterThan(0);
});
test('existing rules untouched, IT rules added, TOKOPEDIA still on same account', async () => {
	// ambil accountId rule TOKOPEDIA sebelum, apply all-rename, assert accountId sama dan jumlah rule bertambah sebesar rule IT yang keyword+direction-nya belum ada
});
test('apply rejects stale fingerprint', async () => {
	const { companyId } = await makeCompany();
	const { diff, fingerprint } = await previewTemplateChange(companyId, 'it');
	await db.update(accounts).set({ name: 'Diubah' }).where(eq(accounts.id, await accountIdByCode(companyId, '1-1001')));
	await expect(applyTemplateChange(companyId, { target: 'it', fingerprint, conflicts: allRename(diff), missing: {}, skip: [] })).rejects.toMatchObject({ status: 409, code: 'coa_changed' });
});
test('plan error is 422 and nothing changes', async () => {
	// conflicts: {} → 422 incomplete; snapshot fingerprint setelahnya sama dengan sebelum
});
test('deactivate missing 1-2105 sets isActive false, does not delete', async () => {});
test('apply twice (IT → IT) is a no-op', async () => {
	// setelah apply all-rename, preview 'it' lagi → conflicts/missing(kecuali 1-2105 bila dibiarkan)/additions kosong; apply → summary semua 0
});
```

Tulis body dari tiga test yang hanya berupa komentar di atas dengan pola yang sama seperti test pertama.

- [ ] **Step 2: Jalankan dan pastikan gagal.** `bun --env-file=../.env test tests/integration/change-template.test.ts` → FAIL.
- [ ] **Step 3: Implementasikan** `change-template.ts` sesuai interface. Periksa nama field `ApiError` (`status`, `code`) di `src/lib/server/api.ts` dan sesuaikan assertion bila namanya berbeda.
- [ ] **Step 4: Jalankan test** → PASS. Lalu `bun run test` (semua) → PASS.
- [ ] **Step 5: Commit** `feat(app): preview and apply CoA template change`.

---

### Task 4: API route

**Files:**
- Create: `src/routes/api/companies/[id]/coa-template/+server.ts`
- Test: `tests/integration/change-template-api.test.ts`

**Interfaces:**
- Consumes: `previewTemplateChange`, `applyTemplateChange` (Task 3), `ChangeTemplateInput`.
- Produces: `GET /api/companies/[id]/coa-template?target=it` → `200 { diff, fingerprint }`. `POST` body `ChangeTemplateInput` → `200 { summary: ApplySummary }`. Keduanya `requireRole(event, 'admin')` dan `params.id !== ctx.companyId → notFound('Perusahaan')` (pola `companies/[id]/+server.ts`). `target` tidak valid → 400 lewat `COA_TEMPLATE_IDS`.

- [ ] **Step 1: Tulis test yang gagal.**

```ts
test('admin previews and applies; accountant is 403; other company is 404', async () => {
	const { companyId } = await makeCompany();
	const admin = await makeUser(); await addMember(admin.id, companyId, 'admin');
	const acc = await makeUser(); await addMember(acc.id, companyId, 'accountant');
	const path = `/api/companies/${companyId}/coa-template?target=it`;
	const prev = await call(GET, fakeEvent({ ctx: await contextFor(admin), path, params: { id: companyId } }));
	expect(prev.status).toBe(200);
	expect(prev.body.diff.conflicts).toHaveLength(25);
	expect((await call(GET, fakeEvent({ ctx: await contextFor(acc), path, params: { id: companyId } }))).status).toBe(403);
	const body = { target: 'it', fingerprint: prev.body.fingerprint, conflicts: allRename(prev.body.diff), missing: {}, skip: [] };
	const res = await call(POST, fakeEvent({ ctx: await contextFor(admin), method: 'POST', body, params: { id: companyId } }));
	expect(res.status).toBe(200);
	expect(res.body.summary.created).toBe(19);
	const other = await makeCompany('PT B');
	expect((await call(GET, fakeEvent({ ctx: await contextFor(admin), path, params: { id: other.companyId } }))).status).toBe(404);
});
test('unknown target is 400', async () => {});
```

- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasikan** route dengan `apiHandler`/`parseJson`.
- [ ] **Step 4: Jalankan** → PASS.
- [ ] **Step 5: Commit** `feat(app): CoA template change API`.

---

### Task 5: Layar review bertahap + tombol masuk

**Files:**
- Create: `src/routes/(app)/settings/company/coa-template/+page.server.ts`, `+page.svelte`
- Modify: `src/routes/(app)/settings/company/+page.svelte` (Card baru di bawah pengaturan perusahaan, sebelum zona hapus)
- Test: `tests/e2e/change-template.spec.ts`

**Interfaces:**
- Consumes: `previewTemplateChange` (load), `buildChangePlan`/`PlanError`/tipe (client), `POST /api/companies/[id]/coa-template` via `apiFetch`, `COA_TEMPLATES`.

Perilaku:
- Pengaturan Perusahaan: Card "Template bagan akun" berisi `SimpleSelect` template tujuan dan tombol **"Ganti template bagan akun"** → `goto('/settings/company/coa-template?target=<id>')`.
- `+page.server.ts`: `requirePageRole(event, 'admin')`, validasi `target` dengan `COA_TEMPLATE_IDS` (tidak valid → `error(400)`), return `{ diff, fingerprint, target, targetLabel, companyId }`.
- Layout B (mockup yang dipilih pengguna): tab langkah **"1. Kode bentrok · N"**, **"2. Tidak ada di template · N"**, **"3. Akun baru · N"**, **Ringkasan**. Langkah kosong ditampilkan dengan "Tidak ada" dan tetap bisa dilewati.
- Langkah 1: kartu per conflict berisi kode, jumlah jurnal, "Sekarang: X → Template: Y", lalu radio **"Ganti nama jadi Y"** / **"Tetap X"**. Untuk leaf, keterangan pilihan kedua ditambah ", akun template dibuat dengan kode `newCodeIfKept`". Radio ganti nama `disabled` bila `!renameAllowed`, dengan keterangan "Saldo normal/tipe berbeda dan akun sudah dipakai jurnal". Akun nonaktif: badge "Nonaktif" + checkbox **"Aktifkan kembali"** (default tercentang). Untuk `nameDiffers: false`, hanya checkbox itu yang ditampilkan dan keputusan `action` di-set `'keep'`. Footer "N dari M belum dipilih", dan tombol Lanjut disabled sampai 0.
- Langkah 2: per akun, `SimpleSelect`/radio **Biarkan** (default) / **Nonaktifkan**. Nonaktifkan disabled untuk akun bank.
- Langkah 3: checkbox per addition, default tercentang. Addition `blocked` ditampilkan disabled dengan keterangan "Induknya akun yang sudah dipakai transaksi". Menghapus centang induk otomatis menghapus centang anaknya, dan mencentang anak otomatis mencentang induknya.
- Peringatan nama ganda: `buildChangePlan` dijalankan di `$derived` (tangkap `PlanError` → tampilkan sebagai status "belum lengkap"). Bila `duplicateNames` tidak kosong, tampilkan banner kuning di ringkasan dan di kartu terkait.
- Ringkasan: "X akun diganti nama, Y akun ditambahkan, Z akun dinonaktifkan, W diaktifkan kembali" + tombol **Terapkan**. Error 409 → pesan dan tombol "Muat ulang". Sukses → toast/alert sukses berisi ringkasan dari server, lalu `goto('/settings/accounts')`.
- Breadcrumb mengikuti pola halaman settings lain (cek `src/lib/nav.ts` dan `tests/unit/breadcrumb.test.ts`; tambahkan entri bila breadcrumb diturunkan dari nav).

- [ ] **Step 1: Tulis e2e yang gagal** di `tests/e2e/change-template.spec.ts`, mengikuti setup login/seed dari `tests/e2e/company-logo.spec.ts`: buka `/settings/company`, pilih "Perusahaan IT / Software", klik "Ganti template bagan akun", pastikan teks "1. Kode bentrok · 25" terlihat, pilih "Ganti nama" untuk semua kartu (`getByLabel(/Ganti nama/).check()` dalam loop), Lanjut ×2, klik Terapkan, lalu di `/settings/accounts` teks "Pendapatan Langganan (SaaS)" terlihat.
- [ ] **Step 2: Jalankan** `bun run test:e2e tests/e2e/change-template.spec.ts` → FAIL.
- [ ] **Step 3: Implementasikan** halaman, dengan komponen yang sudah ada (`Card`, `FormField`, `SimpleSelect`, `PageHeader`, button dari `$lib/components/ui`). Tidak ada warna hardcoded (`tests/unit/no-hardcoded-colors.test.ts`).
- [ ] **Step 4: Jalankan** e2e → PASS, `bun run test` → PASS, `bun run check` → tanpa error.
- [ ] **Step 5: Commit** `feat(app): CoA template change review page`.
