import type { AppContext } from '../../src/lib/server/rbac';

type Handler = (event: never) => Response | Promise<Response>;

export function fakeEvent(opts: {
	ctx: AppContext | null;
	method?: string;
	path?: string;
	body?: unknown;
	form?: FormData;
	params?: Record<string, string>;
}) {
	const url = new URL(opts.path ?? '/', 'http://localhost');
	const init: RequestInit = { method: opts.method ?? 'GET' };
	if (opts.form) init.body = opts.form;
	else if (opts.body !== undefined) {
		init.body = JSON.stringify(opts.body);
		init.headers = { 'content-type': 'application/json' };
	}
	const jar: Record<string, string> = {};
	const cookies = {
		get: (n: string) => jar[n],
		getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
		set: (n: string, v: string) => {
			jar[n] = v;
		},
		delete: (n: string) => {
			delete jar[n];
		},
		serialize: () => ''
	};
	return {
		locals: { ctx: opts.ctx },
		request: new Request(url, init),
		url,
		params: opts.params ?? {},
		cookies,
		jar
	};
}

export async function call(handler: Handler, event: ReturnType<typeof fakeEvent>) {
	const res = await handler(event as never);
	const text = await res.text();
	return { status: res.status, body: text ? JSON.parse(text) : null };
}
