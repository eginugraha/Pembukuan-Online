import type { CoaTemplateId } from '../../coa-templates';
import { DEFAULT_COA, type CoaSeed } from './coa-data';
import { IT_COA, IT_RULES } from './coa-it';
import { DEFAULT_RULES, type RuleSeed } from './rules-data';

export const COA_TEMPLATE_DATA: Record<CoaTemplateId, { coa: CoaSeed[]; rules: RuleSeed[] }> = {
	general: { coa: DEFAULT_COA, rules: DEFAULT_RULES },
	it: { coa: IT_COA, rules: IT_RULES }
};
