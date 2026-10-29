import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { CoaTemplateId } from '../../coa-templates';
import {
	buildChangePlan,
	diffTemplate,
	PlanError,
	rulesToAdd,
	type CompanyAccountSnap,
	type TemplateDiff,
	type TemplateRule
} from '../../coa-template-diff';
import type { ChangeTemplateInput } from '../../schemas/company';
import { ApiError } from '../api';
import { db, type Executor } from '../db';
import { isUniqueViolation } from '../db/errors';
import { accounts, categoryRules } from '../db/schema';
import { COA_TEMPLATE_DATA } from './templates';

interface Row extends Record<string, unknown> {
	id: string;
	code: string;
	name: string;
	type: CompanyAccountSnap['type'];
	normal_bal: CompanyAccountSnap['normalBal'];
	parent_id: string | null;
	is_active: boolean;
	journal_lines: number;
	in_use: boolean;
	is_bank: boolean;
}

/** Snapshot CoA perusahaan dalam satu query; kriteria inUse sama dengan accountInUse(). */
export async function loadSnapshot(
	ex: Executor,
	companyId: string
): Promise<{ accounts: CompanyAccountSnap[]; fingerprint: string }> {
	const rows = await ex.execute<Row>(sql`
		select a.id, a.code, a.name, a.type, a.normal_bal, a.parent_id, a.is_active,
			(select count(*)::int from journal_lines jl where jl.account_id = a.id) as journal_lines,
			(a.id = c.bank_account_id) as is_bank,
			(
				exists (select 1 from journal_lines jl where jl.account_id = a.id)
				or exists (select 1 from transactions t where t.account_id = a.id or t.ai_suggested_account_id = a.id)
				or exists (select 1 from category_rules r where r.account_id = a.id)
				or a.id = c.bank_account_id
			) as in_use
		from accounts a
		join companies c on c.id = a.company_id
		where a.company_id = ${companyId}
	`);
	const list = [...rows];
	const codeById = new Map(list.map((r) => [r.id, r.code]));
	const snaps: CompanyAccountSnap[] = list.map((r) => {
		const children = list.filter((x) => x.parent_id === r.id);
		return {
			id: r.id,
			code: r.code,
			name: r.name,
			type: r.type,
			normalBal: r.normal_bal,
			parentCode: r.parent_id ? (codeById.get(r.parent_id) ?? null) : null,
			isActive: r.is_active,
			hasChildren: children.length > 0,
			hasActiveChildren: children.some((x) => x.is_active),
			journalLines: Number(r.journal_lines),
			inUse: Boolean(r.in_use),
			isBankAccount: Boolean(r.is_bank)
		};
	});
	const fingerprint = createHash('sha256')
		.update(
			[...list]
				.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
				.map((r) => `${r.id}|${r.code}|${r.name}|${r.type}|${r.normal_bal}|${r.parent_id ?? ''}|${r.is_active}`)
				.join('\n')
		)
		.digest('hex');
	return { accounts: snaps, fingerprint };
}

/** Rule template yang keyword (tanpa beda huruf) + arahnya belum dimiliki perusahaan. */
async function pendingRules(ex: Executor, companyId: string, target: CoaTemplateId): Promise<TemplateRule[]> {
	const existing = await ex
		.select({ k: categoryRules.keywordPattern, d: categoryRules.direction })
		.from(categoryRules)
		.where(eq(categoryRules.companyId, companyId));
	const have = new Set(existing.map((r) => `${r.k.toLowerCase()}|${r.d ?? ''}`));
	return COA_TEMPLATE_DATA[target].rules
		.filter((r) => !have.has(`${r.keyword.toLowerCase()}|${r.direction}`))
		.map((r) => ({ keyword: r.keyword, direction: r.direction, account: r.account }));
}

export async function previewTemplateChange(
	companyId: string,
	target: CoaTemplateId
): Promise<{ diff: TemplateDiff; fingerprint: string; pendingRules: TemplateRule[] }> {
	const snap = await loadSnapshot(db, companyId);
	return {
		diff: diffTemplate(target, snap.accounts, COA_TEMPLATE_DATA[target].coa),
		fingerprint: snap.fingerprint,
		pendingRules: await pendingRules(db, companyId, target)
	};
}

export interface ApplySummary {
	renamed: number;
	created: number;
	deactivated: number;
	reactivated: number;
	rulesAdded: number;
}

const STALE_MESSAGE = 'Bagan akun berubah sejak review dibuka. Muat ulang halaman.';

export async function applyTemplateChange(companyId: string, input: ChangeTemplateInput): Promise<ApplySummary> {
	try {
		return await applyInTx(companyId, input);
	} catch (e) {
		// kode akun bentrok dengan akun yang dibuat bersamaan (tidak terkunci oleh fingerprint)
		if (isUniqueViolation(e)) throw new ApiError(409, 'coa_changed', STALE_MESSAGE);
		throw e;
	}
}

function applyInTx(companyId: string, input: ChangeTemplateInput): Promise<ApplySummary> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);
		const snap = await loadSnapshot(tx, companyId);
		if (snap.fingerprint !== input.fingerprint) {
			throw new ApiError(409, 'coa_changed', STALE_MESSAGE);
		}
		const { coa } = COA_TEMPLATE_DATA[input.target];
		const diff = diffTemplate(input.target, snap.accounts, coa);
		let plan;
		try {
			plan = buildChangePlan(diff, input);
		} catch (e) {
			if (e instanceof PlanError) throw new ApiError(422, e.code, e.message);
			throw e;
		}

		const idByCode = new Map(snap.accounts.map((a) => [a.code, a.id]));
		const parentId = (code: string | null, child: string): string | null => {
			if (!code) return null;
			const id = idByCode.get(code);
			if (!id) throw new ApiError(422, 'parent_missing', `Induk ${code} untuk akun ${child} tidak ditemukan`);
			return id;
		};

		// Nama/tipe dulu; parentId setelah akun baru ada (induk bisa akun yang baru dibuat)
		for (const r of plan.renames) {
			await tx.update(accounts).set({ name: r.name, type: r.type, normalBal: r.normalBal }).where(eq(accounts.id, r.accountId));
		}
		for (const id of plan.reactivate) await tx.update(accounts).set({ isActive: true }).where(eq(accounts.id, id));
		for (const id of plan.deactivate) await tx.update(accounts).set({ isActive: false }).where(eq(accounts.id, id));

		for (const c of plan.creates) {
			const [row] = await tx
				.insert(accounts)
				.values({
					companyId,
					code: c.code,
					name: c.name,
					type: c.type,
					normalBal: c.normalBal,
					parentId: parentId(c.parentCode, c.code)
				})
				.returning({ id: accounts.id });
			idByCode.set(c.code, row.id);
		}
		for (const r of plan.renames) {
			await tx
				.update(accounts)
				.set({ parentId: parentId(r.parentCode, r.code) })
				.where(eq(accounts.id, r.accountId));
		}

		// Rule template: tambahkan yang belum ada, hanya ke akun aktif (aturan sama dengan ringkasan di klien)
		let rulesAdded = 0;
		for (const r of rulesToAdd(diff, plan, await pendingRules(tx, companyId, input.target))) {
			const accountId = idByCode.get(r.code);
			if (!accountId) continue;
			const inserted = await tx
				.insert(categoryRules)
				.values({ companyId, keywordPattern: r.keyword, accountId, direction: r.direction, priority: 0, source: 'SYSTEM' })
				.onConflictDoNothing()
				.returning({ id: categoryRules.id });
			rulesAdded += inserted.length;
		}

		return {
			renamed: plan.renames.length,
			created: plan.creates.length,
			deactivated: plan.deactivate.length,
			reactivated: plan.reactivate.length,
			rulesAdded
		};
	});
}
