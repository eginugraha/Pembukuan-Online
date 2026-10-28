/**
 * Catatan dokumen berformat: bold, italic, underline, strike, daftar (bernomor/poin, boleh bersarang), dan
 * paragraf menjorok.
 *
 * Tersimpan sebagai HTML kanonis yang dibuat ulang dari model ini (bukan HTML mentah dari klien), jadi
 * hanya tag di daftar putih, tanpa atribut, dan semua teks di-escape. Catatan lama (teks biasa dengan
 * baris baru) tetap terbaca karena dikenali sebagai teks biasa. Tanpa DOM, jadi jalan di browser, server, dan PDF.
 *
 * Indentasi paragraf = `<blockquote>` (yang dihasilkan browser untuk "indent"); indentasi butir = daftar bersarang.
 */

export type Run = { t: string; b?: boolean; i?: boolean; u?: boolean; s?: boolean } | { br: true };
export type ListItem = { runs: Run[]; level: number; ordered: boolean };
export type Block = { kind: 'p'; runs: Run[]; indent: number } | { kind: 'list'; items: ListItem[] };

/** Kedalaman maksimal indentasi (paragraf dan daftar). */
export const MAX_INDENT = 5;

const HTML_HINT = /<(p|div|br|strong|b|em|i|u|s|strike|del|ul|ol|li|blockquote)[\s/>]/i;
const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|([^<]+|<)/g;
const SKIP_CONTENT = new Set(['script', 'style', 'template', 'noscript']);
const FORMAT: Record<string, 'b' | 'i' | 'u' | 's'> = { strong: 'b', b: 'b', em: 'i', i: 'i', u: 'u', s: 's', strike: 's', del: 's' };

const NAMED: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
	s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
		if (e[0] === '#') {
			const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
		}
		return NAMED[e.toLowerCase()] ?? m;
	});

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const hasText = (runs: Run[]) => runs.some((r) => 't' in r && r.t.trim() !== '');
const clamp = (n: number) => Math.max(0, Math.min(MAX_INDENT, n));

/** Buang <br> penutup yang ditambahkan browser sebagai penampung baris kosong. */
function trimRuns(runs: Run[]): Run[] {
	const out = [...runs];
	while (out.length > 0 && 'br' in out[out.length - 1]) out.pop();
	return out;
}

function parseLegacy(text: string): Block[] {
	return text.split(/\r?\n/).map((line) => ({ kind: 'p' as const, runs: line === '' ? [] : [{ t: line }], indent: 0 }));
}

function parseHtml(html: string): Block[] {
	const blocks: Block[] = [];
	const fmt = { b: 0, i: 0, u: 0, s: 0 };
	const listStack: ('ul' | 'ol')[] = [];
	let list: { kind: 'list'; items: ListItem[] } | null = null;
	let quoteDepth = 0;
	let cur: Run[] | null = null;
	let mode: 'p' | 'li' = 'p';
	let curIndent = 0;
	let curLevel = 0;
	let curOrdered = false;
	let skip: string | null = null;

	const finish = () => {
		if (cur && cur.length > 0) {
			const runs = trimRuns(cur);
			if (mode === 'li' && list) list.items.push({ runs, level: curLevel, ordered: curOrdered });
			else blocks.push({ kind: 'p', runs, indent: curIndent });
		}
		cur = null;
	};
	const begin = () => {
		cur = [];
		mode = list ? 'li' : 'p';
		curIndent = clamp(quoteDepth);
		curLevel = clamp(listStack.length - 1);
		curOrdered = listStack[listStack.length - 1] === 'ol';
	};
	const start = () => {
		finish();
		begin();
	};
	// `cur` diubah lewat closure di atas, jadi dorong lewat closure juga agar tipenya tidak menyempit jadi null.
	const push = (r: Run) => cur?.push(r);

	for (const m of html.matchAll(TOKEN)) {
		const [, closing, rawName, text] = m;
		if (skip) {
			if (rawName && closing && rawName.toLowerCase() === skip) skip = null;
			continue;
		}
		if (text !== undefined) {
			const t = decode(text).replace(/\s+/g, ' ');
			if (!cur) {
				if (t.trim() === '') continue;
				start();
			}
			const run: Run = { t };
			for (const k of ['b', 'i', 'u', 's'] as const) if (fmt[k] > 0) run[k] = true;
			push(run);
			continue;
		}
		if (!rawName) continue; // komentar
		const name = rawName.toLowerCase();
		const close = closing === '/';
		if (SKIP_CONTENT.has(name)) {
			if (!close) skip = name;
			continue;
		}
		if (name in FORMAT) {
			const k = FORMAT[name];
			fmt[k] = close ? Math.max(0, fmt[k] - 1) : fmt[k] + 1;
		} else if (name === 'br') {
			if (!cur) start();
			push({ br: true });
		} else if (name === 'blockquote') {
			finish();
			quoteDepth = close ? Math.max(0, quoteDepth - 1) : quoteDepth + 1;
		} else if (name === 'p' || name === 'div') {
			// Di dalam daftar, paragraf tidak memecah butir.
			if (!list) {
				finish();
				if (!close) begin();
			}
		} else if (name === 'ul' || name === 'ol') {
			finish();
			if (!close) {
				if (listStack.length === 0) {
					list = { kind: 'list', items: [] };
					blocks.push(list);
				}
				listStack.push(name);
			} else if (listStack.length > 0) {
				listStack.pop();
				if (listStack.length === 0) list = null;
			}
		} else if (name === 'li') {
			finish();
			if (!close && list) begin();
		}
	}
	finish();
	return blocks.filter((b) => b.kind !== 'list' || b.items.length > 0);
}

/** Model catatan dari HTML kiriman klien atau teks biasa lama. Kosong bila tak ada teks sama sekali. */
export function parseNotes(input: string | null | undefined): Block[] {
	if (!input || input.trim() === '') return [];
	const blocks = HTML_HINT.test(input) ? parseHtml(input) : parseLegacy(input);
	// Buang baris kosong di awal/akhir; catatan tanpa teks dianggap kosong.
	const empty = (b: Block) => (b.kind === 'p' ? !hasText(b.runs) : b.items.every((it) => !hasText(it.runs)));
	while (blocks.length > 0 && empty(blocks[0])) blocks.shift();
	while (blocks.length > 0 && empty(blocks[blocks.length - 1])) blocks.pop();
	return blocks;
}

function runsHtml(runs: Run[]): string {
	return runs
		.map((r) => {
			if ('br' in r) return '<br>';
			let h = escapeHtml(r.t);
			if (r.s) h = `<s>${h}</s>`;
			if (r.u) h = `<u>${h}</u>`;
			if (r.i) h = `<em>${h}</em>`;
			if (r.b) h = `<strong>${h}</strong>`;
			return h;
		})
		.join('');
}

/** Butir berurutan dengan `level` → daftar bersarang yang valid (`<ul><li>a<ul><li>b</li></ul></li></ul>`). */
function listHtml(items: ListItem[]): string {
	let out = '';
	const open: { tag: 'ul' | 'ol'; liOpen: boolean }[] = [];
	const closeLast = () => {
		const o = open.pop()!;
		out += `${o.liOpen ? '</li>' : ''}</${o.tag}>`;
	};
	for (const it of items) {
		const tag = it.ordered ? 'ol' : 'ul';
		// Tidak boleh melompati tingkat: butir hanya bisa satu tingkat lebih dalam dari yang terbuka.
		const lvl = Math.min(it.level, open.length);
		while (open.length > lvl + 1) closeLast();
		if (open.length === lvl + 1) {
			const o = open[lvl];
			if (o.liOpen) {
				out += '</li>';
				o.liOpen = false;
			}
			if (o.tag !== tag) {
				out += `</${o.tag}><${tag}>`;
				o.tag = tag;
			}
		} else {
			out += `<${tag}>`;
			open.push({ tag, liOpen: false });
		}
		out += `<li>${runsHtml(it.runs)}`;
		open[lvl].liOpen = true;
	}
	while (open.length > 0) closeLast();
	return out;
}

/** HTML kanonis yang aman untuk `{@html}`; string kosong bila catatan tak berisi teks. */
export function notesHtml(input: string | null | undefined): string {
	return parseNotes(input)
		.map((b) => {
			if (b.kind === 'list') return listHtml(b.items);
			const p = `<p>${runsHtml(b.runs) || '<br>'}</p>`;
			return '<blockquote>'.repeat(b.indent) + p + '</blockquote>'.repeat(b.indent);
		})
		.join('');
}

/** Nilai untuk disimpan: HTML kanonis, atau `null` bila kosong. */
export function cleanNotes(input: string | null | undefined): string | null {
	return notesHtml(input) || null;
}
