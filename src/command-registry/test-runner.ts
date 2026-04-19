import type { FilterRule } from "../filter-engine/index.js";

export const testRunnerRules: FilterRule[] = [
	{
		name: "vitest",
		matchCommand: /\bvitest\b/,
		pipeline: {
			stripAnsi: true,
			matchOutput: [
				{
					pattern: /^Test Files\s+\d+ passed \(\d+\)$/m,
					message: "All tests passed.",
					unless: /FAIL|✗|×/,
				},
			],
			keepLinesMatching: [
				/✗|FAIL|fail|×/i,
				/●/,
				/error/i,
				/Expected|Received|AssertionError/,
				/^\s+at .+:\d+/,
				/^Test Files/,
				/^Tests /,
				/^Duration/,
			],
		},
	},
	{
		name: "jest",
		matchCommand: /\bjest\b/,
		pipeline: {
			stripAnsi: true,
			matchOutput: [
				{
					pattern: /^Test Suites:\s+\d+ passed, \d+ total$/m,
					message: "All tests passed.",
					unless: /FAIL|●|\bfailed\b/,
				},
			],
			keepLinesMatching: [
				/^FAIL/,
				/●/,
				/Expected|Received/,
				/^\s+at .+:\d+/,
				/^Tests?:/,
				/^Test Suites?:/,
			],
		},
	},
	{
		name: "bun-test",
		matchCommand: /\bbun\b.*\btest\b/,
		pipeline: {
			stripAnsi: true,
			matchOutput: [
				{
					pattern: /^\d+ tests? passed/m,
					message: "All tests passed.",
					unless: /✗|fail/i,
				},
			],
			keepLinesMatching: [
				/✗|fail/i,
				/error/i,
				/Expected|Received/,
				/^\s+at .+:\d+/,
				/passed|failed/,
			],
		},
	},
	{
		name: "tsc",
		matchCommand: /\btsc\b/,
		pipeline: {
			stripAnsi: true,
			keepLinesMatching: [/error TS\d+/, /warning TS\d+/, /^Found \d+ error/],
			onEmpty: "No TypeScript errors.",
		},
	},
];
