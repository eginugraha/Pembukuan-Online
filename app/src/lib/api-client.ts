export class ClientApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string
	) {
		super(message);
	}
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
	const { json: payload, headers, ...rest } = init;
	const res = await fetch(path, {
		...rest,
		headers: payload !== undefined ? { 'content-type': 'application/json', ...(headers as Record<string, string>) } : headers,
		body: payload !== undefined ? JSON.stringify(payload) : rest.body
	});
	const data = await res.json().catch(() => null);
	if (!res.ok) {
		throw new ClientApiError(
			res.status,
			data?.error?.code ?? 'error',
			data?.error?.message ?? `Permintaan gagal (HTTP ${res.status})`
		);
	}
	return data as T;
}
