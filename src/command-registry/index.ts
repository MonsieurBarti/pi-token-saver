import { FilterRegistry } from "../filter-engine/index.js";
import { fileListingRules } from "./file-listing.js";
import { gitRules } from "./git.js";
import { packageManagerRules } from "./package-manager.js";
import { testRunnerRules } from "./test-runner.js";

export function createRegistry(): FilterRegistry {
	return new FilterRegistry([
		...gitRules,
		...packageManagerRules,
		...testRunnerRules,
		...fileListingRules,
	]);
}
