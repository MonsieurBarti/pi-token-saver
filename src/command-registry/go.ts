import type { FilterRule } from "../filter-engine/index.js";

export const goRules: FilterRule[] = [
	{
		name: "go-build",
		matchCommand: /^\s*go\s+build\b/,
		pipeline: {
			stripAnsi: true,
			keepLinesMatching: [/^#\s/, /\.go:\d+:\d+:/, /^error/i, /cannot find/i],
			maxLines: 100,
			onEmpty: "Build succeeded.",
		},
	},
	{
		name: "go-test",
		matchCommand: /^\s*go\s+test\b/,
		pipeline: {
			stripAnsi: true,
			matchOutput: [
				{
					pattern: /^ok\s+\S+\s+[\d.]+s/m,
					message: "All tests passed.",
					unless: /^FAIL|^---\s+FAIL|panic:/m,
				},
			],
			keepLinesMatching: [
				/^FAIL\b/,
				/^PASS\b/,
				/^---\s+(FAIL|PASS):/,
				/^ok\s+\S+/,
				/panic:/,
				/\.go:\d+:/,
				/^\s+Error:/,
			],
			maxLines: 100,
		},
	},
];
