import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { client, db } from '../../src/lib/server/db';

let migrated: Promise<void> | null = null;

export async function resetDb(): Promise<void> {
	migrated ??= migrate(db, { migrationsFolder: './drizzle/migrations' });
	await migrated;
	await client.unsafe(
		`TRUNCATE TABLE journal_lines, journal_entries, transactions, statement_uploads, category_rules,
		 user_companies, companies, accounts, "session", "account", "verification", "user"
		 RESTART IDENTITY CASCADE`
	);
}
