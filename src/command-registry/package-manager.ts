import type { FilterRule } from "../filter-engine/index.js";

export const packageManagerRules: FilterRule[] = [
	{
		name: "pm-install",
		matchCommand: /\b(npm|yarn|pnpm|bun)\b.*\binstall\b/,
		pipeline: {
			stripAnsi: true,
			keepLinesMatching: [
				/error/i,
				/warn/i,
				/added \d+/,
				/removed \d+/,
				/packages? installed/,
				/Done in/,
				/Resolving \d+/,
			],
			onEmpty: "Install complete.",
		},
	},
	{
		name: "pm-run",
		matchCommand: /\b(npm|yarn|pnpm|bun)\b.*\brun\b/,
		pipeline: {
			stripAnsi: true,
			keepLinesMatching: [/error/i, /warn/i, /^\s*at /, /failed/i],
			onEmpty: "Script completed.",
		},
	},
	{
		name: "turbo-run",
		matchCommand: /\bturbo\b.*\brun\b/,
		pipeline: {
			stripAnsi: true,
			keepLinesMatching: [/error/i, /warn/i, / ERR /, /failed/i, /Tasks:/, /cache (miss|hit)/],
			onEmpty: "Turbo run complete.",
		},
	},
];
