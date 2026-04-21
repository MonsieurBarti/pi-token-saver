import type { FilterRule } from "../filter-engine/index.js";

export const packageManagerRules: FilterRule[] = [
	{
		name: "pm-install",
		matchCommand: /^\s*(npm|pnpm|yarn|bun)\s+(install|add|i)\b/,
		pipeline: {
			stripAnsi: true,
			stripLinesMatching: [
				// npm
				/^added \d+ packages/,
				/^\d+ packages are looking for funding/,
				/^\s*run `npm fund`/,
				/^Run `npm audit`/,
				/^To address/,
				/^\s*npm audit fix/,
				/^up to date/,
				// pnpm
				/^Progress: resolved \d+/,
				/^\+{2,}$/,
				/^Packages: \+\d+/,
				/^dependencies:$/,
				/^\+ \S+ /,
				/^Done in \d+ms using pnpm/,
				// yarn
				/^\[\d\/\d\] /,
				/^yarn install v/,
				/^info No lockfile found\.$/,
				/^success Saved lockfile\.$/,
				/^Done in \d+(\.\d+)?s\.$/,
				// bun
				/^bun install v/,
				/^Saved lockfile$/,
				/^\+ \S+@/,
				/^\d+ packages installed \[/,
			],
			maxLines: 100,
		},
	},
	{
		name: "pm-ls",
		matchCommand: /^\s*(npm|pnpm|yarn|bun)\s+(ls|list)\b/,
		pipeline: {
			stripAnsi: true,
			headLines: 20,
			tailLines: 80,
		},
	},
	{
		name: "pm-audit",
		matchCommand: /^\s*(npm|pnpm|yarn|bun)\s+audit\b/,
		pipeline: {
			stripAnsi: true,
			stripLinesMatching: [
				// pnpm + yarn: pure box-drawing border rows
				/^[\s│├└┌┐┘┼┤┬┴─╭╮╯╰]+$/,
				// pnpm + yarn: labeled detail rows
				/^│\s+(Package|Vulnerable versions|Patched (in|versions)|Paths?|More info|Dependency of)\s*│/,
				// npm: advisory-detail lines
				/^Depends on vulnerable versions of /,
				/^fix available via /,
				/^Will install \S+@/,
				/^node_modules\//,
				// bun: indented path + severity detail + header
				/^\s{2}\S.*\s›\s/,
				/^\s{2}(low|moderate|high|critical):\s/,
				/^bun audit v/,
				/^\s{2}bun update(\s|$)/,
			],
			maxLines: 100,
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
