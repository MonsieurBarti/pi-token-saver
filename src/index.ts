import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createRegistry as _createRegistry } from "./command-registry/index.js";
import type { ResolvedConfig } from "./config/index.js";
import type { FilterRegistry } from "./filter-engine/index.js";
import { registerHook } from "./pi-hook.js";

export type { ResolvedConfig } from "./config/index.js";

export function createRegistry(config: ResolvedConfig): FilterRegistry {
	return _createRegistry(config);
}

export default function extension(api: ExtensionAPI) {
	registerHook(api);
}
