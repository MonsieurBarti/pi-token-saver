import type { FilterRule } from "../filter-engine/index.js";

export const rustRules: FilterRule[] = [
	{
		name: "cargo-build",
		matchCommand: /^\s*cargo\s+build\b/,
		pipeline: {
			stripAnsi: true,
			matchOutput: [
				{
					pattern: /^\s*Finished\s+.*target\(s\)\s+in\s+[\d.]+s/m,
					message: "Build succeeded.",
					unless: /^error(\[E\d+\])?:/m,
				},
			],
			keepLinesMatching: [
				/^error(\[E\d+\])?:/,
				/^warning:/,
				/^\s+-->\s/,
				/^\s+\|/,
				/^\s+=\s+(help|note):/,
				/^\s*Compiling\s/,
			],
			maxLines: 150,
		},
	},
	{
		name: "cargo-test",
		matchCommand: /^\s*cargo\s+test\b/,
		pipeline: {
			stripAnsi: true,
			matchOutput: [
				{
					pattern: /^test result: ok\. \d+ passed/m,
					message: "All tests passed.",
					unless: /FAILED|failures:|panicked/,
				},
			],
			keepLinesMatching: [
				/FAILED/,
				/^error/i,
				/test .+ \.\.\. FAILED/,
				/^failures:/,
				/^---- .+ ----/,
				/thread '.*' panicked/,
				/assertion .* failed/i,
			],
			maxLines: 150,
		},
	},
];
