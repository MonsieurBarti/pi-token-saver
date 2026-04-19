import type { FilterRule } from "../filter-engine/index.js";

export const gitRules: FilterRule[] = [
	{
		name: "git-status",
		matchCommand: /\bgit\b.*\bstatus\b/,
		pipeline: {
			stripAnsi: true,
			stripLinesMatching: [/^\s*\(use "git/],
		},
	},
	{
		name: "git-log",
		matchCommand: /\bgit\b.*\blog\b/,
		pipeline: {
			stripAnsi: true,
			keepLinesMatching: [/^commit /, /^Author:/, /^Date:/, /^ {4}/],
			maxLines: 80,
		},
	},
	{
		name: "git-diff",
		matchCommand: /\bgit\b.*\bdiff\b/,
		pipeline: {
			stripAnsi: true,
			maxLines: 200,
		},
	},
	{
		name: "git-show",
		matchCommand: /\bgit\b.*\bshow\b/,
		pipeline: {
			stripAnsi: true,
			maxLines: 150,
		},
	},
	{
		name: "git-blame",
		matchCommand: /\bgit\b.*\bblame\b/,
		pipeline: {
			stripAnsi: true,
			truncateLinesAt: 120,
			maxLines: 200,
		},
	},
];
