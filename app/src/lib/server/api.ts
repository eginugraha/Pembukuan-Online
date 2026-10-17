import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { issuesToFields } from '../forms/validation';

export class ApiError extends Error {
	/** Field form yang bermasalah; dikirim ke klien sebagai `error.fields`. */
	public field?: string;
	constructor(
		public status: number,
		public code: string,
		message: string,
		public details?: unknown,
		opts: { field?: string } = {}
	) {
		super(message);
		this.field = opts.field;
	}
}


export function notFound(what = 'Data'): ApiError {
	return new ApiError(404, 'not_found', `${what} tidak ditemukan`);
}

export async function apiHandler(fn: () => Promise<Response>): Promise<Response> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof ApiError) {
			const error: Record<string, unknown> = { code: e.code, message: e.message };
			if (e.details !== undefined) error.details = e.details;
			if (e.field) error.fields = { [e.field]: e.message };
			return json({ error }, { status: e.status });
		}
		if (e instanceof z.ZodError) {
			return json(
				{ error: { code: 'validation_error', message: 'Input tidak valid', details: e.issues, fields: issuesToFields(e.issues) } },
				{ status: 400 }
			);
		}
		console.error(e);
		return json(
			{ error: { code: 'internal_error', message: 'Terjadi kesalahan pada server' } },
			{ status: 500 }
		);
	}
}

export async function parseJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new ApiError(400, 'invalid_json', 'Body request harus JSON yang valid');
	}
	return schema.parse(body);
}
