import type { FilterRule } from "../filter-engine/index.js";

export const fileListingRules: FilterRule[] = [
	{
		name: "ls",
		matchCommand: /^\s*ls\b/,
		pipeline: {
			stripAnsi: true,
			maxLines: 50,
			onEmpty: "Empty directory.",
		},
	},
	{
		name: "find",
		matchCommand: /^\s*find\b/,
		pipeline: {
			stripAnsi: true,
			stripLinesMatching: [/Permission denied/, /Operation not permitted/],
			maxLines: 100,
		},
	},
];
