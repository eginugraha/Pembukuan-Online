import { z } from 'zod';
import { isoDate } from './common';

// Tanggal pembayaran wajib; sengaja tidak dibandingkan dengan tanggal invoice.
export const IssuePaymentReceiptInput = z.object({ paymentDate: isoDate });
export type IssuePaymentReceiptInput = z.infer<typeof IssuePaymentReceiptInput>;
