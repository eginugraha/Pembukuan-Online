function hasPgCode(e: unknown, code: string): boolean {
	let cur: unknown = e;
	for (let depth = 0; cur && depth < 5; depth++) {
		if (typeof cur === 'object' && 'code' in cur && (cur as { code: unknown }).code === code) return true;
		cur = typeof cur === 'object' && 'cause' in cur ? (cur as { cause: unknown }).cause : null;
	}
	return false;
}

/** True bila error (atau cause-nya) adalah pelanggaran foreign key Postgres (data masih dirujuk / baru saja dihapus). */
export function isForeignKeyViolation(e: unknown): boolean {
	return hasPgCode(e, '23503');
}

/** True bila error (atau cause-nya, karena Drizzle membungkus error driver) adalah unique violation Postgres. */
export function isUniqueViolation(e: unknown): boolean {
	let cur: unknown = e;
	for (let depth = 0; cur && depth < 5; depth++) {
		if (typeof cur === 'object' && 'code' in cur && (cur as { code: unknown }).code === '23505') return true;
		cur = typeof cur === 'object' && 'cause' in cur ? (cur as { cause: unknown }).cause : null;
	}
	return false;
}
