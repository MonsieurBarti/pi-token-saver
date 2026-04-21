import type { FilterRule } from "../filter-engine/index.js";

export const dockerRules: FilterRule[] = [
	{
		name: "docker-ps",
		matchCommand: /^\s*docker\s+ps\b/,
		pipeline: {
			stripAnsi: true,
			stripLinesMatching: [/^CONTAINER ID/],
			maxLines: 50,
		},
	},
	{
		name: "docker-images",
		matchCommand: /^\s*docker\s+images\b/,
		pipeline: {
			stripAnsi: true,
			stripLinesMatching: [/^REPOSITORY\s/],
			maxLines: 50,
		},
	},
	{
		name: "docker-logs",
		matchCommand: /^\s*docker\s+logs\b/,
		pipeline: { stripAnsi: true, headLines: 20, tailLines: 80 },
	},
	{
		name: "docker-build",
		matchCommand: /^\s*docker\s+build\b/,
		pipeline: { stripAnsi: true, headLines: 20, tailLines: 80 },
	},
];
