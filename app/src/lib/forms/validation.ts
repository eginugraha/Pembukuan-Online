import type { z } from 'zod';

/** Pesan pertama per field (path[0]) dari daftar issue Zod. Dipakai di klien dan server. */
export function issuesToFields(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
	const fields: Record<string, string> = {};
	for (const issue of issues) {
		const key = String(issue.path[0] ?? '_');
		fields[key] ??= issue.message;
	}
	return fields;
}

/** Validasi `values` dengan schema; hasil `{}` bila valid, selain itu pesan per field. */
export function fieldErrors(schema: z.ZodType, values: unknown): Record<string, string> {
	const r = schema.safeParse(values);
	return r.success ? {} : issuesToFields(r.error.issues);
}

/** Pisahkan error server per field menjadi yang cocok dengan field form dan key yang tidak dikenal. */
export function splitServerFields(fields: Record<string, string>, known: string[]): { matched: Record<string, string>; unmatched: string[] } {
	const matched: Record<string, string> = {};
	const unmatched: string[] = [];
	for (const [key, message] of Object.entries(fields)) {
		if (known.includes(key)) matched[key] = message;
		else unmatched.push(key);
	}
	return { matched, unmatched };
}
