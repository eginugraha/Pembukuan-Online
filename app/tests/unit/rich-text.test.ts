import { describe, expect, test } from 'bun:test';
import { cleanNotes, notesHtml } from '$lib/rich-text';

describe('rich-text', () => {
	test('teks biasa lama tetap terbaca, baris baru jadi paragraf', () => {
		expect(notesHtml('Baris 1\nBaris 2')).toBe('<p>Baris 1</p><p>Baris 2</p>');
		expect(notesHtml('a < b & c')).toBe('<p>a &lt; b &amp; c</p>');
	});

	test('format inline dinormalkan ke tag kanonis', () => {
		expect(notesHtml('<div><b>tebal</b> <i>miring</i> <u>garis</u> <strike>coret</strike></div>')).toBe(
			'<p><strong>tebal</strong> <em>miring</em> <u>garis</u> <s>coret</s></p>'
		);
		expect(notesHtml('<p><b><i>dua</i></b></p>')).toBe('<p><strong><em>dua</em></strong></p>');
	});

	test('daftar bernomor dan poin', () => {
		expect(notesHtml('<div>Syarat:</div><ol><li>satu</li><li>dua</li></ol><ul><li>x</li></ul>')).toBe(
			'<p>Syarat:</p><ol><li>satu</li><li>dua</li></ol><ul><li>x</li></ul>'
		);
	});

	test('markup berbahaya dibuang: atribut, skrip, tag tak dikenal', () => {
		const out = notesHtml('<div onclick="x()" style="color:red"><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:1">tautan</a> <b onmouseover="y">ok</b></div>');
		expect(out).toBe('<p>tautan <strong>ok</strong></p>');
		expect(notesHtml('<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
	});

	test('keluaran bersifat idempoten', () => {
		const once = notesHtml('<div>a<br>b</div><ul><li><b>x</b></li></ul>');
		expect(notesHtml(once)).toBe(once);
	});

	test('kosong menjadi null', () => {
		expect(cleanNotes('')).toBeNull();
		expect(cleanNotes('   ')).toBeNull();
		expect(cleanNotes('<div><br></div>')).toBeNull();
		expect(cleanNotes(null)).toBeNull();
	});

	test('br penutup dari browser dibuang, baris kosong di tengah dipertahankan', () => {
		expect(notesHtml('<div>a<br></div><div><br></div><div>b</div>')).toBe('<p>a</p><p><br></p><p>b</p>');
	});
});
