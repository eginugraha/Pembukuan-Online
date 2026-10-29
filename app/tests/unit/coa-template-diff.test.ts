import { expect, test } from 'bun:test';
import {
	buildChangePlan,
	diffTemplate,
	nextFreeCode,
	PlanError,
	type CompanyAccountSnap,
	type TemplateDiff
} from '../../src/lib/coa-template-diff';
import { DEFAULT_COA, type CoaSeed } from '../../src/lib/server/company/coa-data';
import { IT_COA } from '../../src/lib/server/company/coa-it';
import { ChangeTemplateInput } from '../../src/lib/schemas/company';

function snapFrom(coa: CoaSeed[]): CompanyAccountSnap[] {
	return coa.map((s) => {
		const kids = coa.filter((x) => x.parent === s.code);
		return {
			id: `id-${s.code}`,
			code: s.code,
			name: s.name,
			type: s.type,
			normalBal: s.normalBal,
			parentCode: s.parent ?? null,
			isActive: true,
			hasChildren: kids.length > 0,
			hasActiveChildren: kids.length > 0,
			journalLines: 0,
			inUse: false,
			isBankAccount: s.code === '1-1002'
		};
	});
}

test('Umum → IT: 25 bentrok, 1 missing, 19 akun baru', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	expect(d.conflicts.length).toBe(25);
	expect(d.missing.map((m) => m.code)).toEqual(['1-2105']);
	expect(d.additions.filter((a) => a.source === 'new').length).toBe(19);
});
test('missing carries child info', () => {
	const m = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA).missing[0];
	expect(m.hasActiveChildren).toBe(false);
	expect(m.childIds).toEqual([]);
});
test('nextFreeCode skips codes the target template will add', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	expect(d.conflicts.find((c) => c.code === '1-2101')!.newCodeIfKept).toBe('1-2106');
	expect(d.conflicts.find((c) => c.code === '4-1003')!.newCodeIfKept).toBe('4-1009');
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
	// perusahaan punya 1-3100 custom (leaf, terpakai); IT menjadikannya induk 1-3101
	const snap = snapFrom(DEFAULT_COA).filter((a) => a.code !== '1-3100');
	snap.push({
		...snapFrom(DEFAULT_COA).find((a) => a.code === '1-3001')!,
		id: 'x',
		code: '1-3100',
		name: 'Custom',
		parentCode: '1-3000',
		hasChildren: false,
		inUse: true,
		journalLines: 1
	});
	const d = diffTemplate('it', snap, IT_COA);
	expect(d.additions.find((a) => a.code === '1-3101')!.blocked).toBe('parent_in_use');
});
test('identical CoA yields empty diff', () => {
	const d = diffTemplate('general', snapFrom(DEFAULT_COA), DEFAULT_COA);
	expect([d.conflicts, d.missing, d.additions].map((x) => x.length)).toEqual([0, 0, 0]);
});
test('kept addition carries the template account, not the current one', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	expect(d.additions.find((a) => a.source === 'kept' && a.templateCode === '1-2101')).toMatchObject({
		code: '1-2106',
		name: 'Komputer & Laptop',
		parentCode: '1-2100'
	});
	expect(d.additions.find((a) => a.source === 'kept' && a.templateCode === '4-1003')).toMatchObject({
		type: 'REVENUE',
		normalBal: 'CREDIT',
		name: 'Pendapatan Maintenance & Support'
	});
});
test('nextFreeCode increments past taken codes and pads', () => {
	expect(nextFreeCode(['1-2101', '1-2103'], new Set(['1-2104']))).toBe('1-2105');
	expect(nextFreeCode(['4-0008'], new Set())).toBe('4-0009');
});
test('inactive accounts are excluded from missing', () => {
	const snap = snapFrom(DEFAULT_COA);
	snap.find((a) => a.code === '1-2105')!.isActive = false;
	expect(diffTemplate('it', snap, IT_COA).missing).toEqual([]);
});

const allWith = (d: TemplateDiff, action: 'rename' | 'keep') =>
	Object.fromEntries(d.conflicts.map((c) => [c.code, { action, reactivate: false }]));
const allRename = (d: TemplateDiff) => allWith(d, 'rename');

test('all rename: no kept additions, codeMap identity', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	const p = buildChangePlan(d, { conflicts: allRename(d), missing: {}, skip: [] });
	expect(p.renames).toHaveLength(25);
	expect(p.creates).toHaveLength(19);
	expect(p.codeMap['1-2101']).toBe('1-2101');
});
test('keep leaf creates template account under new code', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	const p = buildChangePlan(d, {
		conflicts: { ...allRename(d), '1-2101': { action: 'keep', reactivate: false } },
		missing: {},
		skip: []
	});
	expect(p.creates.find((c) => c.code === '1-2106')!.name).toBe('Komputer & Laptop');
	expect(p.codeMap['1-2101']).toBe('1-2106');
});
test('incomplete decisions throw', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	expect(() => buildChangePlan(d, { conflicts: {}, missing: {}, skip: [] })).toThrow(PlanError);
});
test('rename blocked when balance differs and journals exist', () => {
	const snap = snapFrom(DEFAULT_COA);
	snap.find((a) => a.code === '4-1003')!.journalLines = 1;
	const d = diffTemplate('it', snap, IT_COA);
	expect(() => buildChangePlan(d, { conflicts: allRename(d), missing: {}, skip: [] })).toThrow(
		/rename_not_allowed|saldo/i
	);
});
test('child addition requires parent', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	expect(() => buildChangePlan(d, { conflicts: allRename(d), missing: {}, skip: ['1-3100'] })).toThrow(PlanError);
	const ok = buildChangePlan(d, {
		conflicts: allRename(d),
		missing: {},
		skip: ['1-3100', '1-3101', '1-3102', '1-3103']
	});
	expect(ok.codeMap['1-3101']).toBeNull();
});
test('duplicate names warned: 1-2103 kept + 1-2104 renamed to Kendaraan', () => {
	const d = diffTemplate('it', snapFrom(DEFAULT_COA), IT_COA);
	const p = buildChangePlan(d, {
		conflicts: { ...allRename(d), '1-2103': { action: 'keep', reactivate: false } },
		missing: {},
		skip: []
	});
	expect(p.duplicateNames).toContain('Kendaraan');
});
test('deactivate guards', () => {
	const snap = snapFrom(IT_COA);
	snap.push({ ...snap.find((a) => a.code === '1-1002')!, id: 'bank2', code: '1-1099', isBankAccount: true });
	const d = diffTemplate('it', snap, IT_COA);
	expect(() => buildChangePlan(d, { conflicts: {}, missing: { bank2: 'deactivate' }, skip: [] })).toThrow(PlanError);
});
test('deactivate blocked by active children, ok when children deactivate too', () => {
	const snap = snapFrom(IT_COA);
	const mk = (id: string, code: string, parentCode: string | null): CompanyAccountSnap => ({
		...snap[0], id, code, parentCode, isBankAccount: false, hasChildren: false, hasActiveChildren: false
	});
	snap.push({ ...mk('hp', '1-9000', null), hasChildren: true, hasActiveChildren: true }, mk('hc', '1-9001', '1-9000'));
	const d = diffTemplate('it', snap, IT_COA);
	expect(() => buildChangePlan(d, { conflicts: {}, missing: { hp: 'deactivate' }, skip: [] })).toThrow(PlanError);
	const ok = buildChangePlan(d, { conflicts: {}, missing: { hp: 'deactivate', hc: 'deactivate' }, skip: [] });
	expect(ok.deactivate.sort()).toEqual(['hc', 'hp']);
});
test('inactive conflict renamed is reactivated', () => {
	const snap = snapFrom(IT_COA);
	snap.find((a) => a.code === '5-2014')!.isActive = false;
	const d = diffTemplate('it', snap, IT_COA);
	const p = buildChangePlan(d, { conflicts: allRename(d), missing: {}, skip: [] });
	expect(p.reactivate).toEqual(['id-5-2014']);
});
test('ChangeTemplateInput rejects unknown template', () => {
	expect(ChangeTemplateInput.safeParse({ target: 'pabrik', fingerprint: 'x', conflicts: {}, missing: {} }).success).toBe(false);
});
