import type { FilterRule } from "../filter-engine/index.js";

export const networkRules: FilterRule[] = [
	{
		name: "curl",
		matchCommand: /^\s*curl\b/,
		pipeline: {
			stripAnsi: true,
			stripLinesMatching: [/^[<>*]\s/],
			maxLines: 200,
		},
	},
	{
		name: "http",
		matchCommand: /^\s*http\s/,
		pipeline: {
			stripAnsi: true,
			stripLinesMatching: [/^HTTP\//],
			maxLines: 200,
		},
	},
];
