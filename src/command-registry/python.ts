import type { FilterRule } from "../filter-engine/index.js";

export const pythonRules: FilterRule[] = [
	{
		name: "python-install",
		matchCommand:
			/^\s*(pip3?\s+install|uv\s+(add|sync|lock|pip\s+install|tool\s+install)|poetry\s+(add|install|update|lock|remove))\b/,
		pipeline: {
			stripAnsi: true,
			matchOutput: [
				{
					pattern: /^Successfully installed\s/m,
					message: "Install succeeded.",
					unless: /^ERROR|^error:/m,
				},
			],
			keepLinesMatching: [
				/^Successfully installed/,
				/^Installed\s/,
				/^Installing\s/,
				/^ERROR/,
				/^error:/i,
				/^WARNING/,
				/Could not find/,
				/conflicting/i,
				/^Package .* requires/,
			],
			maxLines: 100,
			onEmpty: "Install succeeded.",
		},
	},
];
