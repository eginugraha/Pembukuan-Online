import { D } from '$lib/money';

const SATUAN = [
	'Nol', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan',
	'Sepuluh', 'Sebelas'
];
const SKALA = ['', 'Ribu', 'Juta', 'Miliar', 'Triliun', 'Kuadriliun'];

// Eja bilangan 0-999 (tanpa "Nol").
function ejaRatusan(n: number): string {
	const out: string[] = [];
	const ratus = Math.floor(n / 100);
	const sisa = n % 100;
	if (ratus === 1) out.push('Seratus');
	else if (ratus > 1) out.push(SATUAN[ratus], 'Ratus');
	if (sisa >= 12 && sisa < 20) out.push(SATUAN[sisa - 10], 'Belas');
	else if (sisa >= 20) {
		out.push(SATUAN[Math.floor(sisa / 10)], 'Puluh');
		if (sisa % 10) out.push(SATUAN[sisa % 10]);
	} else if (sisa > 0) {
		out.push(SATUAN[sisa]);
	}
	return out.join(' ');
}

function ejaBulat(n: string): string {
	if (n === '0') return 'Nol';
	// Pecah per 3 digit dari belakang
	const kelompok: number[] = [];
	for (let i = n.length; i > 0; i -= 3) kelompok.unshift(Number(n.slice(Math.max(0, i - 3), i)));
	const bagian: string[] = [];
	kelompok.forEach((k, idx) => {
		if (k === 0) return;
		const skala = kelompok.length - 1 - idx;
		if (skala === 1 && k === 1) bagian.push('Seribu');
		else bagian.push([ejaRatusan(k), SKALA[skala]].filter(Boolean).join(' '));
	});
	return bagian.join(' ');
}

/** Terbilang rupiah dalam Title Case, mis. "Seratus Dua Puluh Lima Rupiah Lima Puluh Sen". */
export function terbilang(amount: string): string {
	const nilai = D(amount).toDecimalPlaces(2).abs();
	const [bulat, desimal = ''] = nilai.toFixed(2).split('.');
	const sen = Number(desimal);
	let hasil = `${ejaBulat(bulat)} Rupiah`;
	if (sen > 0) hasil += ` ${ejaBulat(String(sen))} Sen`;
	return hasil;
}
