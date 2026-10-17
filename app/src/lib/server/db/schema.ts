import { sql } from 'drizzle-orm';
import {
	type AnyPgColumn,
	boolean,
	check,
	customType,
	date,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
	varchar
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 18, scale: 2 });
const day = (name: string) => date(name, { mode: 'string' });
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
	dataType: () => 'bytea',
	toDriver: (v) => Buffer.from(v),
	fromDriver: (v) => new Uint8Array(v)
});

export const userRole = pgEnum('user_role', ['admin', 'accountant', 'viewer']);
export const accountType = pgEnum('account_type', ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']);
export const normalBalance = pgEnum('normal_balance', ['DEBIT', 'CREDIT']);
export const cashFlowCategory = pgEnum('cash_flow_category', ['OPERATING', 'INVESTING', 'FINANCING']);
export const ruleSource = pgEnum('rule_source', ['SYSTEM', 'USER']);
export const txDirection = pgEnum('tx_direction', ['DB', 'CR']);
export const uploadStatus = pgEnum('upload_status', ['processing', 'review', 'done', 'error']);
export const txSource = pgEnum('tx_source', ['RULE', 'AI', 'USER']);
export const journalType = pgEnum('journal_type', ['OPENING', 'TRANSACTION']);

// ── Better Auth ───────────────────────────────────────────────
export const user = pgTable('user', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	isSuperAdmin: boolean('is_super_admin').notNull().default(false),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

// Foto profil disimpan terpisah dari tabel user agar query user tetap ringan.
export const userAvatars = pgTable('user_avatars', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	content: bytea('content').notNull(),
	mime: varchar('mime', { length: 20 }).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const session = pgTable('session', {
	id: uuid('id').primaryKey().defaultRandom(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	token: text('token').notNull().unique(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: uuid('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

export const authAccount = pgTable('account', {
	id: uuid('id').primaryKey().defaultRandom(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: uuid('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
	scope: text('scope'),
	password: text('password'),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

export const verification = pgTable('verification', {
	id: uuid('id').primaryKey().defaultRandom(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

// ── Multi-company ─────────────────────────────────────────────
export const companies = pgTable('companies', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	npwp: varchar('npwp', { length: 20 }),
	address: text('address'),
	fiscalYear: varchar('fiscal_year', { length: 10 }).notNull().default('JANUARY'),
	currency: varchar('currency', { length: 5 }).notNull().default('IDR'),
	bankAccountId: uuid('bank_account_id').references((): AnyPgColumn => accounts.id, {
		onDelete: 'set null'
	}),
	createdAt: createdAt()
});

export const userCompanies = pgTable(
	'user_companies',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		role: userRole('role').notNull()
	},
	(t) => [unique('user_companies_user_company_uq').on(t.userId, t.companyId)]
);

// ── Chart of Accounts ─────────────────────────────────────────
export const accounts = pgTable(
	'accounts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		code: varchar('code', { length: 20 }).notNull(),
		name: text('name').notNull(),
		type: accountType('type').notNull(),
		normalBal: normalBalance('normal_bal').notNull(),
		parentId: uuid('parent_id').references((): AnyPgColumn => accounts.id),
		cashFlowCat: cashFlowCategory('cash_flow_cat'),
		isActive: boolean('is_active').notNull().default(true)
	},
	(t) => [unique('accounts_company_code_uq').on(t.companyId, t.code), index('accounts_parent_idx').on(t.parentId)]
);

// ── Category rules ────────────────────────────────────────────
export const categoryRules = pgTable(
	'category_rules',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		keywordPattern: text('keyword_pattern').notNull(),
		accountId: uuid('account_id')
			.notNull()
			.references(() => accounts.id),
		direction: txDirection('direction'),
		priority: integer('priority').notNull().default(0),
		source: ruleSource('source').notNull().default('SYSTEM'),
		createdAt: createdAt()
	},
	(t) => [
		unique('category_rules_company_keyword_direction_uq')
			.on(t.companyId, t.keywordPattern, t.direction)
			.nullsNotDistinct()
	]
);

// ── Statement & transactions ──────────────────────────────────
export const statementUploads = pgTable(
	'statement_uploads',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		uploadedBy: uuid('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
		filename: text('filename').notNull(),
		bank: varchar('bank', { length: 20 }).notNull().default('BCA'),
		accountNo: varchar('account_no', { length: 30 }).notNull(),
		periodStart: day('period_start').notNull(),
		periodEnd: day('period_end').notNull(),
		openingBalance: money('opening_balance').notNull(),
		closingBalance: money('closing_balance').notNull(),
		status: uploadStatus('status').notNull().default('processing'),
		balanceWarning: text('balance_warning'),
		errorMessage: text('error_message'),
		aiStatus: text('ai_status'),
		uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('statement_uploads_company_account_idx').on(t.companyId, t.accountNo)]
);

export const transactions = pgTable(
	'transactions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		uploadId: uuid('upload_id')
			.notNull()
			.references(() => statementUploads.id, { onDelete: 'cascade' }),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		lineNo: integer('line_no').notNull(),
		txnDate: day('txn_date').notNull(),
		description: text('description').notNull(),
		groupKey: text('group_key').notNull(),
		debit: money('debit').notNull().default('0'),
		credit: money('credit').notNull().default('0'),
		balance: money('balance'),
		accountId: uuid('account_id').references(() => accounts.id),
		isConfirmed: boolean('is_confirmed').notNull().default(false),
		aiConfidence: numeric('ai_confidence', { precision: 4, scale: 3 }),
		source: txSource('source'),
		aiSuggestedAccountId: uuid('ai_suggested_account_id').references(() => accounts.id),
		aiReason: text('ai_reason'),
		aiKeyword: text('ai_keyword'),
		confirmedBy: uuid('confirmed_by').references(() => user.id, { onDelete: 'set null' }),
		confirmedAt: timestamp('confirmed_at', { withTimezone: true })
	},
	(t) => [
		index('transactions_company_pending_idx').on(t.companyId, t.isConfirmed),
		index('transactions_upload_idx').on(t.uploadId, t.lineNo)
	]
);

// ── Journal ───────────────────────────────────────────────────
export const journalEntries = pgTable(
	'journal_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		type: journalType('type').notNull(),
		uploadId: uuid('upload_id').references(() => statementUploads.id, { onDelete: 'cascade' }),
		transactionId: uuid('transaction_id')
			.unique()
			.references(() => transactions.id, { onDelete: 'cascade' }),
		entryDate: day('entry_date').notNull(),
		description: text('description'),
		refNo: varchar('ref_no', { length: 50 }),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('journal_entries_company_date_idx').on(t.companyId, t.entryDate)]
);

export const journalLines = pgTable(
	'journal_lines',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		journalId: uuid('journal_id')
			.notNull()
			.references(() => journalEntries.id, { onDelete: 'cascade' }),
		accountId: uuid('account_id')
			.notNull()
			.references(() => accounts.id),
		debit: money('debit').notNull().default('0'),
		credit: money('credit').notNull().default('0')
	},
	(t) => [
		index('journal_lines_account_idx').on(t.accountId),
		check(
			'journal_lines_one_side',
			sql`${t.debit} >= 0 AND ${t.credit} >= 0 AND ((${t.debit} = 0) <> (${t.credit} = 0))`
		)
	]
);
