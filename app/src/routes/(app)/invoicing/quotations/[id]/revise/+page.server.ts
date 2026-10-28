import { loadQuotationForm } from '$lib/server/invoicing/quotation-form-page';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => loadQuotationForm(event, event.params.id);
