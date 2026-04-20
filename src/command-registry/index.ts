import type { ResolvedConfig } from "../config/index.js";
import { FilterRegistry } from "../filter-engine/index.js";
import { fileListingRules } from "./file-listing.js";
import { gitRules } from "./git.js";
import { packageManagerRules } from "./package-manager.js";
import { testRunnerRules } from "./test-runner.js";

const builtInRules = [...gitRules, ...packageManagerRules, ...testRunnerRules, ...fileListingRules];

export function createRegistry(config?: ResolvedConfig): FilterRegistry {
	const resolved = config ?? { disabled: [], rules: [] };
	const merged = [...resolved.rules, ...builtInRules].filter(
		(r) => !resolved.disabled.includes(r.name),
	);
	return new FilterRegistry(merged);
}
