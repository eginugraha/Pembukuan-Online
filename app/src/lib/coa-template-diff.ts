import type { CoaSeed } from './server/company/coa-data';
import type { CoaTemplateId } from './coa-templates';
import type { ChangeTemplateInput } from './schemas/company';

type AccountType = CoaSeed['type'];
type NormalBal = CoaSeed['normalBal'];

export interface CompanyAccountSnap {
	id: string;
	code: string;
	name: string;
	type: AccountType;
	normalBal: NormalBal;
	parentCode: string | null;
	isActive: boolean;
	hasChildren: boolean;
	hasActiveChildren: boolean;
	journalLines: number;
	inUse: boolean; // accountInUse(): jurnal/transaksi/rule/bank
	isBankAccount: boolean;
}

export interface ConflictItem {
	code: string;
	accountId: string;
	current: { name: string; type: AccountType; normalBal: NormalBal; parentCode: string | null; isActive: boolean };
	target: { name: string; type: AccountType; normalBal: NormalBal; parentCode: string | null };
	journalLines: number;
	isHeader: boolean;
	nameDiffers: boolean;
	renameAllowed: boolean;
	newCodeIfKept: string | null;
}

export interface MissingItem {
	accountId: string;
	code: string;
	name: string;
	parentCode: string | null;
	journalLines: number;
	isBankAccount: boolean;
	hasActiveChildren: boolean;
	childIds: string[];
}

export interface AdditionItem {
	templateCode: string;
	code: string; // templateCode, atau newCodeIfKept untuk sumber 'kept'
	name: string;
	type: AccountType;
	normalBal: NormalBal;
	parentCode: string | null;
	source: 'new' | 'kept';
	blocked: 'parent_in_use' | null;
}

export interface TemplateDiff {
	target: CoaTemplateId;
	conflicts: ConflictItem[];
	missing: MissingItem[];
	additions: AdditionItem[];
	accounts: { code: string; name: string; isActive: boolean }[];
}

const byCode = <T extends { code: string }>(a: T, b: T) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

// Kode berformat D-DDDD: ambil suffix terbesar dari saudara, naikkan sampai tidak ada di `taken`.
export function nextFreeCode(siblingCodes: string[], taken: Set<string>): string {
	const prefix = siblingCodes[0]?.split('-')[0] ?? '1';
	let n = Math.max(0, ...siblingCodes.map((c) => parseInt(c.split('-')[1] ?? '0', 10) || 0)) + 1;
	while (taken.has(`${prefix}-${String(n).padStart(4, '0')}`)) n++;
	return `${prefix}-${String(n).padStart(4, '0')}`;
}

export function diffTemplate(target: CoaTemplateId, current: CompanyAccountSnap[], coa: CoaSeed[]): TemplateDiff {
	const cur = new Map(current.map((a) => [a.code, a]));
	const tpl = new Map(coa.map((a) => [a.code, a]));
	const tplParents = new Set(coa.map((a) => a.parent).filter((p): p is string => !!p));
	const taken = new Set<string>([...cur.keys(), ...tpl.keys()]);

	const conflicts: ConflictItem[] = [];
	const kept: AdditionItem[] = [];
	const sharedCurrent = [...current].sort(byCode).filter((a) => tpl.has(a.code));

	for (const a of sharedCurrent) {
		const t = tpl.get(a.code)!;
		const tParent = t.parent ?? null;
		const nameDiffers =
			a.name !== t.name || a.type !== t.type || a.normalBal !== t.normalBal || a.parentCode !== tParent;
		if (!nameDiffers && a.isActive) continue;
		const isHeader = a.hasChildren || tplParents.has(a.code);
		let newCodeIfKept: string | null = null;
		if (nameDiffers && !isHeader) {
			const siblings = [
				...current.filter((x) => x.parentCode === tParent).map((x) => x.code),
				...coa.filter((x) => (x.parent ?? null) === tParent).map((x) => x.code)
			];
			const keptParent = tParent ? cur.get(tParent) : undefined;
			newCodeIfKept = nextFreeCode(siblings, taken);
			taken.add(newCodeIfKept);
			kept.push({
				templateCode: a.code,
				code: newCodeIfKept,
				name: t.name,
				type: t.type,
				normalBal: t.normalBal,
				parentCode: tParent,
				source: 'kept',
				blocked: keptParent && !keptParent.hasChildren && keptParent.inUse ? 'parent_in_use' : null
			});
		}
		conflicts.push({
			code: a.code,
			accountId: a.id,
			current: { name: a.name, type: a.type, normalBal: a.normalBal, parentCode: a.parentCode, isActive: a.isActive },
			target: { name: t.name, type: t.type, normalBal: t.normalBal, parentCode: tParent },
			journalLines: a.journalLines,
			isHeader,
			nameDiffers,
			renameAllowed: !((a.type !== t.type || a.normalBal !== t.normalBal) && a.journalLines > 0),
			newCodeIfKept
		});
	}

	const missing: MissingItem[] = current
		.filter((a) => !tpl.has(a.code) && a.isActive)
		.sort(byCode)
		.map((a) => {
			// hanya anak aktif: anak nonaktif tidak muncul di daftar missing sehingga tidak bisa diputuskan
			const children = current.filter((x) => x.parentCode === a.code && x.isActive);
			return {
				accountId: a.id,
				code: a.code,
				name: a.name,
				parentCode: a.parentCode,
				journalLines: a.journalLines,
				isBankAccount: a.isBankAccount,
				hasActiveChildren: a.hasActiveChildren,
				childIds: children.map((x) => x.id)
			};
		});

	const fresh: AdditionItem[] = coa
		.filter((t) => !cur.has(t.code))
		.sort(byCode)
		.map((t) => {
			const parent = t.parent ? cur.get(t.parent) : undefined;
			return {
				templateCode: t.code,
				code: t.code,
				name: t.name,
				type: t.type,
				normalBal: t.normalBal,
				parentCode: t.parent ?? null,
				source: 'new' as const,
				blocked: parent && !parent.hasChildren && parent.inUse ? ('parent_in_use' as const) : null
			};
		});

	// Urut kode, tapi induk (yang juga akan ditambahkan) selalu sebelum anak.
	const pending = [...fresh, ...kept].sort(byCode);
	const pendingCodes = new Set(pending.map((a) => a.code));
	const additions: AdditionItem[] = [];
	const emitted = new Set<string>();
	const emit = (a: AdditionItem) => {
		if (emitted.has(a.code)) return;
		emitted.add(a.code);
		const p = a.parentCode && pendingCodes.has(a.parentCode) ? pending.find((x) => x.code === a.parentCode) : undefined;
		if (p) emit(p);
		additions.push(a);
	};
	pending.forEach(emit);

	return {
		target,
		conflicts,
		missing,
		additions,
		accounts: [...current].sort(byCode).map((a) => ({ code: a.code, name: a.name, isActive: a.isActive }))
	};
}

export class PlanError extends Error {
	constructor(
		public code: string,
		message: string
	) {
		super(message);
		this.name = 'PlanError';
	}
}

interface PlannedAccount {
	code: string;
	name: string;
	type: AccountType;
	normalBal: NormalBal;
	parentCode: string | null;
}

export interface ChangePlan {
	renames: (PlannedAccount & { accountId: string })[];
	reactivate: string[];
	deactivate: string[];
	creates: PlannedAccount[]; // induk dulu
	codeMap: Record<string, string | null>; // templateCode → kode setelah apply; null = dilewati
	duplicateNames: string[];
}

export function buildChangePlan(
	diff: TemplateDiff,
	decisions: Pick<ChangeTemplateInput, 'conflicts' | 'missing' | 'skip'>
): ChangePlan {
	const skip = new Set(decisions.skip);
	const renames: ChangePlan['renames'] = [];
	const reactivate: string[] = [];
	const deactivate: string[] = [];
	const codeMap: Record<string, string | null> = {};
	const keptLeaf = new Set<string>(); // templateCode yang di-keep dan membuat akun baru

	for (const c of diff.conflicts) {
		const d = decisions.conflicts[c.code];
		if (!d) throw new PlanError('incomplete', 'Masih ada akun bentrok yang belum diputuskan');
		codeMap[c.code] = c.code;
		if (d.action === 'rename') {
			if (!c.renameAllowed)
				throw new PlanError(
					'rename_not_allowed',
					`Akun ${c.code} tidak bisa diganti: tipe/saldo normal berbeda dan sudah punya jurnal`
				);
			if (c.nameDiffers) renames.push({ accountId: c.accountId, ...c.target, code: c.code });
			if (!c.current.isActive) reactivate.push(c.accountId);
		} else {
			if (d.reactivate && !c.current.isActive) reactivate.push(c.accountId);
			if (c.nameDiffers && !c.isHeader) keptLeaf.add(c.code);
		}
	}

	const creates: PlannedAccount[] = [];
	const createdNew = new Set<string>();
	const skippedNew = new Set<string>();
	for (const a of diff.additions) {
		const create = a.source === 'kept' ? keptLeaf.has(a.templateCode) : true;
		if (!create) continue;
		if (a.blocked || skip.has(a.templateCode)) {
			codeMap[a.templateCode] = null;
			if (a.source === 'new') skippedNew.add(a.code);
			continue;
		}
		if (a.parentCode && skippedNew.has(a.parentCode))
			throw new PlanError('parent_skipped', `Akun ${a.code} butuh induk ${a.parentCode} yang dilewati`);
		creates.push({ code: a.code, name: a.name, type: a.type, normalBal: a.normalBal, parentCode: a.parentCode });
		codeMap[a.templateCode] = a.code;
		if (a.source === 'new') createdNew.add(a.code);
	}

	for (const r of renames) {
		if (r.parentCode && skippedNew.has(r.parentCode))
			throw new PlanError('parent_skipped', `Akun ${r.code} butuh induk ${r.parentCode} yang dilewati`);
	}

	const toDeactivate = new Set(
		diff.missing.filter((m) => decisions.missing[m.accountId] === 'deactivate').map((m) => m.accountId)
	);
	for (const m of diff.missing) {
		if (!toDeactivate.has(m.accountId)) continue;
		if (m.isBankAccount) throw new PlanError('bank_account', `Akun bank ${m.code} tidak bisa dinonaktifkan`);
		if (m.hasActiveChildren && m.childIds.some((id) => !toDeactivate.has(id)))
			throw new PlanError('active_children', `Akun ${m.code} masih punya akun anak aktif`);
		deactivate.push(m.accountId);
	}

	// Nama aktif setelah apply
	const state = new Map(diff.accounts.map((a) => [a.code, { name: a.name, active: a.isActive }]));
	for (const r of renames) state.get(r.code)!.name = r.name;
	for (const c of diff.conflicts) if (reactivate.includes(c.accountId)) state.get(c.code)!.active = true;
	for (const m of diff.missing) if (toDeactivate.has(m.accountId)) state.get(m.code)!.active = false;
	for (const c of creates) state.set(c.code, { name: c.name, active: true });
	const counts = new Map<string, { n: number; name: string }>();
	for (const a of state.values()) {
		if (!a.active) continue;
		const k = a.name.trim().toLowerCase();
		const e = counts.get(k);
		if (e) e.n++;
		else counts.set(k, { n: 1, name: a.name.trim() });
	}
	const duplicateNames = [...counts.values()]
		.filter((e) => e.n > 1)
		.map((e) => e.name)
		.sort((a, b) => a.localeCompare(b));

	return { renames, reactivate, deactivate, creates, codeMap, duplicateNames };
}
