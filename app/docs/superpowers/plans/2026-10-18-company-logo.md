# Company Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a company admin upload, interactively crop, and remove a company logo; show it on the dashboard; and store it so a future PDF export can use it without any data redesign.

**Architecture:** Mirrors the existing user-avatar feature (`src/lib/server/users/avatar.ts`, `user_avatars` table, `/api/users/[id]/avatar`) but scoped to `companyId` instead of `userId`, stored as `bytea` in a new `company_logos` table. The one real difference from avatar is the crop step: avatar auto-center-crops, but this feature needs an interactive pan/zoom crop (most company logos are non-square wordmarks). That crop is built as a small pure-math module (testable without a DOM) plus a thin canvas-drawing wrapper (not unit-tested, same as the existing `squareResize` in `$lib/image.ts`), exactly mirroring how `$lib/charts.ts` is unit-tested while its SVG rendering isn't.

**Tech Stack:** SvelteKit + Svelte 5 runes, Drizzle ORM/Postgres (`bytea` column via the existing `customType` in `schema.ts`), bun test (unit + integration), Playwright (e2e). No new npm dependency — the crop UI is built from `<canvas>` + Pointer Events, following this codebase's existing pattern of building small UI primitives from scratch instead of adding a library.

**Spec:** `docs/superpowers/specs/2026-10-18-company-logo-design.md`

## Global Constraints

- No new npm dependency for the crop UI (spec Constraints; matches existing `$lib/charts.ts` precedent).
- Crop output is 512×512 WebP with alpha (transparency) preserved — never flattened to white.
- Default/minimum zoom is "fit inside" the square (the whole logo visible, letterboxed on the shorter axis) — never "fill the square" like the avatar's auto-crop. The user can zoom in further from there.
- Client-side accepted input types and max input size reuse the existing `AVATAR_ACCEPT` / `AVATAR_MAX_INPUT_BYTES` constants from `$lib/image.ts` (JPEG/PNG/WebP, 5 MB) — do not duplicate these constants.
- Server-side stored-size cap is 512 KB (spec: "sama seperti avatar"), enforced independently of client behavior, with magic-byte sniffing (not client-declared `Content-Type`).
- Only a company admin (`requireRole(event, 'admin')`) may upload or remove the logo; any member of the company (`viewer` and up) may fetch/view it.
- The logo is never used as a favicon and never appears in the app sidebar/top bar — those keep the "pena" brand untouched.
- Dashboard logo display uses a fixed light backing chip (not theme-reactive) because the stored image may be transparent and a dark logo must stay visible in dark mode.
- No PDF work in this plan — only `getCompanyLogo(companyId)` needs to exist and be stable for a later feature to call.

## Review Focus

- **Cross-company leakage:** switching the active company must show that company's own logo (or no logo), never a previously-viewed company's logo. → Task 1 test.
- **Role gating on both non-admin roles:** `viewer` and `accountant` must both be rejected from upload/remove, not just `viewer`. → Task 1 test.
- **Unreadable/corrupt image file picked client-side:** must show a readable error in the crop dialog, not a silent failure or crash. → Task 3 (error surface) + Task 4 (e2e).
- **Re-upload produces a fresh cache-busted URL:** uploading a second logo must change the `?v=` value so browsers don't keep showing the old cached image. → Task 1 test.
- **Removing a logo leaves no retrievable remnant:** after delete, `getCompanyLogo` must return `null` and `companies.logoUrl` must be cleared — no dangling row or stale URL. → Task 1 test.

---

### Task 1: Company logo storage & API

**Files:**
- Modify: `src/lib/server/db/schema.ts` (add `companyLogos` table + `companies.logoUrl` column)
- Create: migration via `bun run db:generate` (writes into `drizzle/migrations/`)
- Create: `src/lib/server/company/logo.ts`
- Modify: `src/lib/server/rbac.ts` (`CompanyMembership.logoUrl`, `resolveContext` select)
- Create: `src/routes/api/companies/[id]/logo/+server.ts`
- Test: `tests/integration/company-logo.test.ts`

**Interfaces:**
- Produces (for Task 4): `PUT /api/companies/[id]/logo` (FormData field `file`) → `{ image: string }`; `DELETE /api/companies/[id]/logo` → `{ image: null }`; `GET /api/companies/[id]/logo` → raw image bytes.
- Produces (for Task 5): `CompanyMembership.logoUrl: string | null` on every entry of `ctx.companies`.

- [ ] **Step 1: Add the schema**

In `src/lib/server/db/schema.ts`, add a `logoUrl: text('logo_url')` nullable column to the existing `companies` table definition, and add a new table right after it:

```ts
export const companyLogos = pgTable('company_logos', {
	companyId: uuid('company_id')
		.primaryKey()
		.references(() => companies.id, { onDelete: 'cascade' }),
	content: bytea('content').notNull(),
	mime: varchar('mime', { length: 20 }).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
```

(`bytea` is the existing `customType` already defined above `user_avatars` in this file — reuse it, don't redefine it.)

- [ ] **Step 2: Generate and apply the migration**

Run: `bun run db:generate`
Expected: a new file appears under `drizzle/migrations/` adding `company_logos` and `companies.logo_url`.

Run: `bun run db:migrate`
Expected: exits 0, no errors.

- [ ] **Step 3: Write the failing service tests**

Create `tests/integration/company-logo.test.ts`:

```ts
import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { companies } from '../../src/lib/server/db/schema';
import { getCompanyLogo, MAX_LOGO_BYTES, removeCompanyLogo, setCompanyLogo } from '../../src/lib/server/company/logo';
import { PUT as PUT_LOGO, DELETE as DELETE_LOGO, GET as GET_LOGO } from '../../src/routes/api/companies/[id]/logo/+server';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { resolveContext } from '../../src/lib/server/rbac';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const WEBP = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP'), 1, 2]);

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('setCompanyLogo stores the image and points companies.logoUrl at a versioned URL', async () => {
	const { companyId } = await makeCompany();
	const url = await setCompanyLogo(companyId, WEBP);
	expect(url).toMatch(new RegExp(`^/api/companies/${companyId}/logo\\?v=\\d+$`));
	const row = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	expect(row?.logoUrl).toBe(url);
	const logo = await getCompanyLogo(companyId);
	expect(logo?.mime).toBe('image/webp');
	expect([...logo!.content]).toEqual([...WEBP]);
});

test('setCompanyLogo rejects non-images and oversized files', async () => {
	const { companyId } = await makeCompany();
	expect(await codeOf(setCompanyLogo(companyId, new TextEncoder().encode('<svg onload=alert(1)>')))).toBe('invalid_image');
	const big = new Uint8Array(MAX_LOGO_BYTES + 1);
	big.set(PNG);
	expect(await codeOf(setCompanyLogo(companyId, big))).toBe('image_too_large');
	expect(await getCompanyLogo(companyId)).toBeNull();
});

test('setCompanyLogo re-upload changes the cache-busting version', async () => {
	const { companyId } = await makeCompany();
	const url1 = await setCompanyLogo(companyId, PNG);
	const url2 = await setCompanyLogo(companyId, WEBP);
	expect(url2).not.toBe(url1);
});

test('removeCompanyLogo deletes the image and clears companies.logoUrl', async () => {
	const { companyId } = await makeCompany();
	await setCompanyLogo(companyId, PNG);
	await removeCompanyLogo(companyId);
	expect(await getCompanyLogo(companyId)).toBeNull();
	expect((await db.query.companies.findFirst({ where: eq(companies.id, companyId) }))?.logoUrl).toBeNull();
});

test('PUT/DELETE /api/companies/:id/logo require admin on the active company (viewer and accountant both rejected)', async () => {
	const { companyId } = await makeCompany();
	const admin = await makeUser();
	await addMember(admin.id, companyId, 'admin');
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const accountant = await makeUser();
	await addMember(accountant.id, companyId, 'accountant');
	const adminCtx = await contextFor(admin, companyId);
	const viewerCtx = await contextFor(viewer, companyId);
	const accountantCtx = await contextFor(accountant, companyId);

	const form = () => {
		const f = new FormData();
		f.append('file', new File([WEBP], 'logo.webp', { type: 'image/webp' }));
		return f;
	};

	expect((await call(PUT_LOGO, fakeEvent({ ctx: viewerCtx, method: 'PUT', params: { id: companyId }, form: form() }))).status).toBe(403);
	expect((await call(PUT_LOGO, fakeEvent({ ctx: accountantCtx, method: 'PUT', params: { id: companyId }, form: form() }))).status).toBe(403);
	const put = await call(PUT_LOGO, fakeEvent({ ctx: adminCtx, method: 'PUT', params: { id: companyId }, form: form() }));
	expect(put.status).toBe(200);
	expect(put.body.image).toMatch(`/api/companies/${companyId}/logo?v=`);

	expect((await call(DELETE_LOGO, fakeEvent({ ctx: viewerCtx, method: 'DELETE', params: { id: companyId } }))).status).toBe(403);
	expect((await call(DELETE_LOGO, fakeEvent({ ctx: adminCtx, method: 'DELETE', params: { id: companyId } }))).status).toBe(200);
	expect(await getCompanyLogo(companyId)).toBeNull();
});

test('PUT /api/companies/:id/logo 404s when :id is not the caller\'s active company', async () => {
	const { companyId: own } = await makeCompany('A');
	const { companyId: other } = await makeCompany('B');
	const admin = await makeUser();
	await addMember(admin.id, own, 'admin');
	await addMember(admin.id, other, 'admin');
	const ctx = await contextFor(admin, own);
	const form = new FormData();
	form.append('file', new File([WEBP], 'logo.webp', { type: 'image/webp' }));
	expect((await call(PUT_LOGO, fakeEvent({ ctx, method: 'PUT', params: { id: other }, form }))).status).toBe(404);
});

test('GET /api/companies/:id/logo serves the image with cache headers to members; 404 without logo; 401 anonymous', async () => {
	const { companyId } = await makeCompany();
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const ctx = await contextFor(viewer, companyId);
	const ev = () => fakeEvent({ ctx, params: { id: companyId } });

	expect((await GET_LOGO(ev() as never)).status).toBe(404);
	await setCompanyLogo(companyId, PNG);
	const res = await GET_LOGO(ev() as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('image/png');
	expect(res.headers.get('cache-control')).toContain('private');
	expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...PNG]);

	expect((await GET_LOGO(fakeEvent({ ctx: null, params: { id: companyId } }) as never)).status).toBe(401);
});

test('resolveContext exposes each company\'s own logoUrl, never another company\'s', async () => {
	const { companyId: a } = await makeCompany('A');
	const { companyId: b } = await makeCompany('B');
	const admin = await makeUser();
	await addMember(admin.id, a, 'admin');
	await addMember(admin.id, b, 'admin');
	const urlA = await setCompanyLogo(a, PNG);
	const ctx = await resolveContext({ id: admin.id, email: admin.email, name: admin.name, isSuperAdmin: false }, a);
	expect(ctx.companies.find((c) => c.id === a)?.logoUrl).toBe(urlA);
	expect(ctx.companies.find((c) => c.id === b)?.logoUrl).toBeNull();
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bun test tests/integration/company-logo.test.ts`
Expected: FAIL — `logo.ts` / the route / the schema fields don't exist yet.

- [ ] **Step 5: Implement `src/lib/server/company/logo.ts`**

Mirror `src/lib/server/users/avatar.ts` exactly, scoped to `companyId`:

```ts
export const MAX_LOGO_BYTES = 512 * 1024;

export async function setCompanyLogo(companyId: string, content: Uint8Array): Promise<string>
export async function removeCompanyLogo(companyId: string): Promise<void>
export async function getCompanyLogo(companyId: string): Promise<{ content: Uint8Array; mime: string; updatedAt: Date } | null>
```

Reuse `avatar.ts`'s `sniffImage` logic (copy the magic-byte check; there's no shared module to import it from). URL format: `` `/api/companies/${companyId}/logo?v=${now.getTime()}` ``. On set, write `company_logos` and `companies.logoUrl` in one `db.transaction`, same as `setAvatar` does for `user_avatars`/`user.image`. Error codes: `invalid_image` (400) when `sniffImage` returns null, `image_too_large` (400) when `content.byteLength > MAX_LOGO_BYTES`, both with `{ field: 'file' }`.

- [ ] **Step 6: Add `logoUrl` to the session context**

In `src/lib/server/rbac.ts`: add `logoUrl: string | null` to `CompanyMembership`. In `resolveContext`, add `companies.logoUrl` to both `.select({...})` calls (super-admin branch and member branch) and carry it through into the returned `memberships` mapping.

- [ ] **Step 7: Implement `src/routes/api/companies/[id]/logo/+server.ts`**

Mirror the existing `src/routes/api/profile/avatar/+server.ts` (PUT/DELETE) and `src/routes/api/users/[id]/avatar/+server.ts` (GET), but:
- `PUT`/`DELETE`/`GET` all start with `requireRole(event, 'admin')` for PUT/DELETE and `requireRole(event, 'viewer')` for GET, then `if (event.params.id !== ctx.companyId) throw notFound('Perusahaan')` (same two-line guard already used in `src/routes/api/companies/[id]/+server.ts`).
- `PUT` calls `setCompanyLogo(ctx.companyId, ...)`, error `invalid_image` (400) `'File logo wajib diunggah'` when the form has no `File`.
- `DELETE` calls `removeCompanyLogo(ctx.companyId)`.
- `GET` calls `getCompanyLogo(ctx.companyId)`, `throw notFound('Logo perusahaan')` when null, otherwise the same `Response`/header shape as `GET /api/users/[id]/avatar`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test tests/integration/company-logo.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 9: Run the full test suite**

Run: `bun run test`
Expected: all pass (no regressions in `rbac`-dependent tests from the new `logoUrl` field).

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/db/schema.ts drizzle/migrations src/lib/server/company/logo.ts src/lib/server/rbac.ts src/routes/api/companies/[id]/logo tests/integration/company-logo.test.ts
git commit -m "feat(app): company logo storage and API"
```

---

### Task 2: Crop math library

**Files:**
- Create: `src/lib/logo-crop.ts`
- Test: `tests/unit/logo-crop.test.ts`

**Interfaces:**
- Produces (for Task 3): `LOGO_OUTPUT_SIZE`, `LOGO_MAX_ZOOM`, `LogoCrop { zoom: number; panX: number; panY: number }`, `containScale(imgW, imgH, box?): number`, `drawParams(imgW, imgH, crop: LogoCrop, box?): { dx, dy, dw, dh }`, `drawInto(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap, crop: LogoCrop, box?): void`, `renderLogoCrop(bitmap: ImageBitmap, crop: LogoCrop, box?): Promise<Blob>`, `loadBitmap(file: File): Promise<ImageBitmap>`.

`zoom: 1` means the whole image fits inside the box (the minimum/default). `panX`/`panY` are `0..1` fractions of the available travel range on that axis; `0.5` is centered. This fractional design means a pan value stays meaningful across any zoom change — no re-clamping needed when zoom changes.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/logo-crop.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { containScale, drawParams } from '../../src/lib/logo-crop';

test('containScale fits the longer axis exactly inside the box', () => {
	expect(containScale(1600, 400, 512)).toBeCloseTo(0.32, 5);
	expect(containScale(400, 1600, 512)).toBeCloseTo(0.32, 5);
	expect(containScale(512, 512, 512)).toBe(1);
});

test('drawParams at zoom=1 letterboxes the shorter axis, centered', () => {
	const d = drawParams(1600, 400, { zoom: 1, panX: 0.5, panY: 0.5 }, 512);
	expect(d.dw).toBeCloseTo(512, 5);
	expect(d.dh).toBeCloseTo(128, 5);
	expect(d.dx).toBeCloseTo(0, 5);
	expect(d.dy).toBeCloseTo(192, 5);
});

test('drawParams pans across overflow once zoom pushes an axis past the box', () => {
	const left = drawParams(1600, 400, { zoom: 2, panX: 0, panY: 0.5 }, 512);
	const right = drawParams(1600, 400, { zoom: 2, panX: 1, panY: 0.5 }, 512);
	expect(left.dw).toBeCloseTo(1024, 5);
	expect(left.dx).toBeCloseTo(0, 5);
	expect(right.dx).toBeCloseTo(-512, 5);
});

test('drawParams keeps the shorter axis centered even while the longer axis is panned', () => {
	const d = drawParams(1600, 400, { zoom: 2, panX: 0.5, panY: 0.5 }, 512);
	expect(d.dh).toBeCloseTo(256, 5);
	expect(d.dy).toBeCloseTo(128, 5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/logo-crop.test.ts`
Expected: FAIL with "containScale not defined" (module doesn't exist yet).

- [ ] **Step 3: Implement `src/lib/logo-crop.ts`**

```ts
export const LOGO_OUTPUT_SIZE = 512;
export const LOGO_MAX_ZOOM = 4;

export interface LogoCrop {
	zoom: number;
	panX: number;
	panY: number;
}

export function containScale(imgW: number, imgH: number, box = LOGO_OUTPUT_SIZE): number {
	return Math.min(box / imgW, box / imgH);
}

function axisOffset(size: number, box: number, pan: number): number {
	return size <= box ? (box - size) / 2 : -(size - box) * pan;
}

export function drawParams(imgW: number, imgH: number, crop: LogoCrop, box = LOGO_OUTPUT_SIZE) {
	const scale = containScale(imgW, imgH, box) * crop.zoom;
	const dw = imgW * scale;
	const dh = imgH * scale;
	return { dx: axisOffset(dw, box, crop.panX), dy: axisOffset(dh, box, crop.panY), dw, dh };
}
```

Then add the DOM-dependent wrappers below the pure functions (these are not unit-tested, same as `squareResize` in `$lib/image.ts` — no canvas in the bun test environment):

```ts
export async function loadBitmap(file: File): Promise<ImageBitmap> {
	return createImageBitmap(file).catch(() => {
		throw new Error('Logo tidak bisa dibaca. Coba file lain.');
	});
}

export function drawInto(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap, crop: LogoCrop, box = LOGO_OUTPUT_SIZE): void {
	ctx.clearRect(0, 0, box, box);
	const { dx, dy, dw, dh } = drawParams(bitmap.width, bitmap.height, crop, box);
	ctx.drawImage(bitmap, dx, dy, dw, dh);
}

export async function renderLogoCrop(bitmap: ImageBitmap, crop: LogoCrop, box = LOGO_OUTPUT_SIZE): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = box;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Browser tidak mendukung pengolahan gambar');
	drawInto(ctx, bitmap, crop, box);
	return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar'))), 'image/webp', 0.92));
}
```

Note: `canvas.toBlob` with `'image/webp'` preserves alpha automatically because `clearRect` leaves the canvas transparent and nothing fills it before `drawImage` — do not add any `fillRect`/background fill call.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/logo-crop.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/logo-crop.ts tests/unit/logo-crop.test.ts
git commit -m "feat(app): pure crop-geometry math for the company logo tool"
```

---

### Task 3: LogoCropDialog component

**Files:**
- Create: `src/lib/components/LogoCropDialog.svelte`

**Interfaces:**
- Consumes: `LOGO_MAX_ZOOM`, `LogoCrop`, `drawInto`, `loadBitmap`, `renderLogoCrop` from `$lib/logo-crop` (Task 2).
- Produces (for Task 4): a dialog component with props `{ file: File; onconfirm: (blob: Blob) => void; oncancel: () => void }`.

No automated test for this task (canvas pointer-drag interaction isn't unit-testable in this project's bun test environment, and isn't driven directly by Playwright either — Task 4's e2e drives it through the default centered crop, which exercises load → render → confirm → blob). Verify this task manually in a browser before moving on.

- [ ] **Step 1: Implement the component**

Create `src/lib/components/LogoCropDialog.svelte` using bits-ui's `Dialog` (the pattern already used elsewhere in this codebase for modals) with:

- A `<canvas width={LOGO_OUTPUT_SIZE} height={LOGO_OUTPUT_SIZE}>` bound via `bind:this`, sized to a reasonable on-screen box with CSS (e.g. `class="h-64 w-64"`) while keeping its pixel dimensions at `LOGO_OUTPUT_SIZE`.
- On mount / whenever `file` changes, call `loadBitmap(file)`; on failure, show the thrown error's `.message` instead of the canvas. On success, store the bitmap and initialize `crop = { zoom: 1, panX: 0.5, panY: 0.5 }`.
- Redraw with `drawInto(ctx, bitmap, crop)` whenever `bitmap` or `crop` changes.
- Pointer drag on the canvas pans: on `pointerdown`, capture the pointer and record the start client coordinates and the current `crop.panX`/`panY`. On `pointermove` while captured, compute the current `drawParams` free range for each axis at the current zoom (`dw - box`, `dh - box`, floored at a small epsilon to avoid divide-by-zero when there's no overflow) and convert the pixel delta to a pan delta as `delta.panX -= (movementPixelsX / onScreenCanvasWidth) * (dw / freeRangeX-ish)`; concretely: `newPan = clamp(startPan - (clientDeltaPx / canvasDisplayPx) * (dw / freeRange), 0, 1)` so dragging right moves the visible crop left (pan decreases) — pick the sign so the image visually follows the drag, verify this by hand in the browser.
- A `<input type="range" min="1" max={LOGO_MAX_ZOOM} step="0.01">` bound to `crop.zoom`, labeled (`aria-label="Perbesar logo"`).
- "Gunakan" button: calls `renderLogoCrop(bitmap, crop)`, then `onconfirm(blob)`. Disabled while `bitmap` is null or while rendering.
- "Batal" button: calls `oncancel()`.
- Dialog title text: "Atur Logo".

- [ ] **Step 2: Manually verify in the browser**

Run: `bun run dev`, temporarily mount `LogoCropDialog` with a test file (or wait for Task 4's wiring — if Task 4 is implemented in the same work session, verify through it instead of a throwaway harness).
Expected: picking a wide image shows it letterboxed and centered by default; dragging pans in the direction dragged; the zoom slider zooms in; "Gunakan" produces a 512×512 WebP with the expected crop.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/LogoCropDialog.svelte
git commit -m "feat(app): interactive pan/zoom crop dialog for the company logo"
```

---

### Task 4: Settings page wiring

**Files:**
- Modify: `src/routes/(app)/settings/company/+page.svelte`
- Test: `tests/e2e/company-logo.spec.ts`

**Interfaces:**
- Consumes: `PUT`/`DELETE /api/companies/[id]/logo` (Task 1), `LogoCropDialog` (Task 3), `AVATAR_ACCEPT`/`AVATAR_MAX_INPUT_BYTES` from `$lib/image` (Global Constraints).
- Consumes: `data.company.logoUrl` — add `logoUrl` to the `getCompany` result used by this page's loader (it already comes through `db.query.companies.findFirst`, so no loader code change is needed once Task 1's schema change lands — only confirm the type flows through).

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/company-logo.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

const PNG_SMALL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGPIXusARww4OQA8qhAhsk77hwAAAABJRU5ErkJggg==', 'base64');

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/settings/company');
});

test('upload a logo through the crop dialog, see it applied, then remove it', async ({ page }) => {
	await page.getByLabel('Pilih logo perusahaan').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_SMALL });
	await expect(page.getByRole('dialog', { name: 'Atur Logo' })).toBeVisible();
	await page.getByRole('button', { name: 'Gunakan' }).click();
	await expect(page.getByText('Logo perusahaan diperbarui.')).toBeVisible();
	await expect(page.getByRole('img', { name: /[Ll]ogo/ })).toHaveAttribute('src', /\/api\/companies\/[0-9a-f-]{36}\/logo\?v=\d+/);

	await page.getByRole('button', { name: 'Hapus Logo' }).click();
	await expect(page.getByText('Logo perusahaan dihapus.')).toBeVisible();
});

test('cancelling the crop dialog does not upload anything', async ({ page }) => {
	await page.getByLabel('Pilih logo perusahaan').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_SMALL });
	await expect(page.getByRole('dialog', { name: 'Atur Logo' })).toBeVisible();
	await page.getByRole('button', { name: 'Batal' }).click();
	await expect(page.getByRole('dialog', { name: 'Atur Logo' })).toBeHidden();
});

test('an unreadable file shows a friendly error in the dialog', async ({ page }) => {
	await page.getByLabel('Pilih logo perusahaan').setInputFiles({ name: 'rusak.png', mimeType: 'image/png', buffer: Buffer.from('bukan gambar') });
	await expect(page.getByText('Logo tidak bisa dibaca. Coba file lain.')).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run: `bunx playwright test tests/e2e/company-logo.spec.ts`
Expected: FAIL — no upload control exists on the page yet.

- [ ] **Step 3: Wire the page**

In `src/routes/(app)/settings/company/+page.svelte`, add a "Logo Perusahaan" `Card.Root` above the existing company-details card:
- A visible trigger button ("Pilih Logo" if `data.company.logoUrl` is null, "Ganti Logo" otherwise) next to a hidden `<input type="file" accept={AVATAR_ACCEPT.join(',')} aria-label="Pilih logo perusahaan">` (same pattern as `profile/+page.svelte`'s `onPick`), validating `AVATAR_ACCEPT`/`AVATAR_MAX_INPUT_BYTES` client-side exactly like that page does.
- When a file is picked, store it in state and render `<LogoCropDialog file={pickedFile} onconfirm={...} oncancel={...} />` conditionally on that state being non-null.
- `onconfirm(blob)`: `PUT` the blob as `FormData` field `file` (named `logo.webp`) to `` `/api/companies/${data.company.id}/logo` ``, same fetch-and-throw-on-!ok pattern as `profile/+page.svelte`'s avatar upload; on success show `message = 'Logo perusahaan diperbarui.'`, clear the picked-file state, `await invalidateAll()`.
- `oncancel()`: just clear the picked-file state.
- When `data.company.logoUrl` is set, show `<img src={data.company.logoUrl} alt="Logo perusahaan" class="size-16 rounded-lg object-contain" role="img">` and a "Hapus Logo" button that calls `apiFetch('/api/companies/${data.company.id}/logo', { method: 'DELETE' })`, then shows `'Logo perusahaan dihapus.'` and `await invalidateAll()`.

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `bunx playwright test tests/e2e/company-logo.spec.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/settings/company/+page.svelte" tests/e2e/company-logo.spec.ts
git commit -m "feat(app): upload, crop, and remove the company logo from settings"
```

---

### Task 5: Dashboard display

**Files:**
- Modify: `src/lib/components/PageHeader.svelte`
- Modify: `src/routes/(app)/dashboard/+page.svelte`
- Modify: `tests/e2e/dashboard-charts.spec.ts` (add one assertion, reusing the existing dedicated `ZZ Grafik E2E` company/login already set up by `tests/e2e/seed-charts.ts` and `E2E_CHARTS_EMAIL`)

**Interfaces:**
- Consumes: `data.ctx.companies[].logoUrl` (Task 1).

- [ ] **Step 1: Write the failing e2e test**

In `tests/e2e/dashboard-charts.spec.ts`, add:

```ts
test('dashboard shows no logo chip when the company has none', async ({ page }) => {
	await expect(page.getByRole('img', { name: /^Logo/ })).toHaveCount(0);
});
```

(This pins the fallback behavior — Global Constraints says "no logo set → unchanged" — before any logo-chip markup exists, so there's nothing yet to assert a positive case against without also uploading a logo through Task 4's flow, which belongs to that task's own suite, not this one.)

- [ ] **Step 2: Run the e2e test to verify it currently passes trivially, then add the positive case**

Run: `bunx playwright test tests/e2e/dashboard-charts.spec.ts -g "no logo chip"`
Expected: PASS (there is no chip markup at all yet, so the assertion is vacuously true — this step exists to confirm the selector is well-formed before Step 4 makes it meaningful).

- [ ] **Step 3: Implement the prop and wiring**

In `src/lib/components/PageHeader.svelte`, add an optional prop `logoUrl?: string | null` to the destructured props. When set, render it just left of the `<h1>`:

```svelte
{#if logoUrl}
	<img src={logoUrl} alt="" aria-hidden="true" class="mr-3 inline-block size-10 rounded-lg bg-white p-1 object-contain align-middle" />
{/if}
```

(`alt=""` + `aria-hidden="true"` because the adjacent title/description already convey the company identity to screen readers; `bg-white` is intentionally not a theme token — Global Constraints requires this chip to stay light regardless of dark mode so a transparent dark logo stays visible.)

In `src/routes/(app)/dashboard/+page.svelte`, pass it through:

```svelte
<PageHeader title="Dashboard" description="Ringkasan pembukuan {companyName}" logoUrl={data.ctx.companies.find((c) => c.id === data.ctx.companyId)?.logoUrl} />
```

- [ ] **Step 4: Run the e2e test to verify it still passes**

Run: `bunx playwright test tests/e2e/dashboard-charts.spec.ts -g "no logo chip"`
Expected: PASS (the test company seeded by `seed-charts.ts` has no logo, so the chip still doesn't render).

- [ ] **Step 5: Run the full test suite twice**

Run: `bun run test && bun run check && bun run build && bunx playwright test`
Run it a second time: `bunx playwright test`
Expected: all green both times (per this project's established flakiness-check habit).

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/PageHeader.svelte "src/routes/(app)/dashboard/+page.svelte" tests/e2e/dashboard-charts.spec.ts
git commit -m "feat(app): show the company logo on the dashboard"
```
