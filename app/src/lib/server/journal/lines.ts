import { D, sumMoney, toMoney } from '../../money';
import { ApiError } from '../api';

export interface JournalLineInput {
	accountId: string;
	debit: string;
	credit: string;
}

export function assertBalanced(lines: JournalLineInput[]): void {
	if (lines.length < 2) throw new ApiError(422, 'unbalanced', 'Jurnal minimal terdiri dari dua baris');
	for (const l of lines) {
		const d = D(l.debit);
		const c = D(l.credit);
		if (d.isNeg() || c.isNeg() || d.isZero() === c.isZero()) {
			throw new ApiError(422, 'invalid_line', 'Setiap baris jurnal harus berisi debit atau kredit saja, tidak negatif');
		}
	}
	const totalDebit = sumMoney(lines.map((l) => l.debit));
	const totalCredit = sumMoney(lines.map((l) => l.credit));
	if (!totalDebit.eq(totalCredit)) {
		throw new ApiError(
			422,
			'unbalanced',
			`Jurnal tidak balance: debit ${toMoney(totalDebit)} ≠ kredit ${toMoney(totalCredit)}`
		);
	}
}

/** Uang keluar (DB): Dr akun kategori / Cr bank. Uang masuk (CR): Dr bank / Cr akun kategori. */
export function buildTransactionLines(
	t: { debit: string; credit: string; accountId: string },
	bankAccountId: string
): JournalLineInput[] {
	if (D(t.debit).gt(0)) {
		const amount = toMoney(t.debit);
		return [
			{ accountId: t.accountId, debit: amount, credit: '0.00' },
			{ accountId: bankAccountId, debit: '0.00', credit: amount }
		];
	}
	const amount = toMoney(t.credit);
	return [
		{ accountId: bankAccountId, debit: amount, credit: '0.00' },
		{ accountId: t.accountId, debit: '0.00', credit: amount }
	];
}
