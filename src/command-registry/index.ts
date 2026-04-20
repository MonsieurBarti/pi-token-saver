import type { ResolvedConfig } from "../config/index.js";
import { FilterRegistry } from "../filter-engine/index.js";
import { dockerRules } from "./docker.js";
import { fileListingRules } from "./file-listing.js";
import { gitRules } from "./git.js";
import { networkRules } from "./network.js";
import { packageManagerRules } from "./package-manager.js";
import { searchRules } from "./search.js";
import { testRunnerRules } from "./test-runner.js";

const builtInRules = [
	...gitRules,
	...packageManagerRules,
	...testRunnerRules,
	...fileListingRules,
	...dockerRules,
	...networkRules,
	...searchRules,
];

export function createRegistry(config?: ResolvedConfig): FilterRegistry {
	const resolved = config ?? { disabled: [], rules: [] };
	const merged = [...resolved.rules, ...builtInRules].filter(
		(r) => !resolved.disabled.includes(r.name),
	);
	return new FilterRegistry(merged);
}
