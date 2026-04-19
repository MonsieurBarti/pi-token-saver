import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerHook } from "./pi-hook.js";

export default function extension(api: ExtensionAPI) {
	registerHook(api);
}
