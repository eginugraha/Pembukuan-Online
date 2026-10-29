import type { CoaSeed } from './server/company/coa-data';
import type { CoaTemplateId } from './coa-templates';

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
			const children = current.filter((x) => x.parentCode === a.code);
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
