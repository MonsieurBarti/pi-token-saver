import type { FilterRule } from "../filter-engine/index.js";

export const buildRules: FilterRule[] = [
	{
		name: "build-tools",
		matchCommand: /^\s*(make|cmake)\b/,
		pipeline: {
			stripAnsi: true,
			keepLinesMatching: [
				/:\s*error:/i,
				/:\s*warning:/i,
				/\berror\s*[A-Z]?\d+/,
				/\bwarning\s*[A-Z]?\d+/,
				/\bCMake\s+(Error|Warning)\b/,
				/undefined reference/i,
				/No rule to make target/,
				/\bError\s+\d+\b/,
				/\bfatal\b/i,
				/\*\*\*.*failed/i,
			],
			maxLines: 100,
			onEmpty: "Build succeeded.",
		},
	},
];
