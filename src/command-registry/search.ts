import type { FilterRule } from "../filter-engine/index.js";

export const searchRules: FilterRule[] = [
	{
		name: "grep",
		matchCommand: /^\s*grep\b/,
		pipeline: { stripAnsi: true, maxLines: 150 },
	},
	{
		name: "rg",
		matchCommand: /^\s*rg\b/,
		pipeline: { stripAnsi: true, maxLines: 150 },
	},
];
