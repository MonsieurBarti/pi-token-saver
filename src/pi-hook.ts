import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import { isBashToolResult } from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createRegistry } from "./command-registry/index.js";
import { DiscoverTracker, registerDiscoverCommand } from "./discover-command/index.js";
import { FilterEngine } from "./filter-engine/index.js";
import { registerGainCommand } from "./gain-command/index.js";
import { createPassthroughFlag, registerPassthroughCommand } from "./passthrough-mode/index.js";
import { SavingsTracker } from "./savings-tracker/index.js";

export const TOKEN_SAVER_FILTERED_EVENT = "token-saver:filtered";
export const TOKEN_SAVER_UNMATCHED_EVENT = "token-saver:unmatched";
export const IMAGE_ONLY_FALLBACK =
	"Output captured as image — pager may be active. Retry the command with pager disabled.";

export interface UnmatchedEvent {
	command: string;
	byteCount: number;
	timestamp: number;
}

export interface FilterRecord {
	command: string;
	bytesBefore: number;
	bytesAfter: number;
	timestamp: number;
}

export function registerHook(api: ExtensionAPI): void {
	const registry = createRegistry();
	const engine = new FilterEngine(registry);
	const sessionId = Date.now();
	new SavingsTracker(api.events, sessionId);
	registerGainCommand(api, sessionId);
	new DiscoverTracker(api.events, sessionId);
	registerDiscoverCommand(api, sessionId);
	const passthroughFlag = createPassthroughFlag();
	registerPassthroughCommand(api, passthroughFlag);

	api.on("tool_result", (event, _ctx) => {
		if (!isBashToolResult(event)) return;
		if (event.isError) return;

		const command = event.input.command;
		if (typeof command !== "string") return;

		const textParts: string[] = [];
		const otherContent: (TextContent | ImageContent)[] = [];
		for (const c of event.content) {
			if (c.type === "text") textParts.push(c.text);
			else otherContent.push(c);
		}
		if (textParts.length === 0) {
			if (otherContent.length === 0) return;
			// Don't consume flag: pager swallowed the output, user's bypass intent is still unmet.
			if (passthroughFlag.active) return;
			const rule = registry.find(command);
			if (!rule) return;
			const fallback = rule.imageOnlyFallback ?? IMAGE_ONLY_FALLBACK;
			return { content: [{ type: "text", text: fallback }, ...otherContent] };
		}

		if (passthroughFlag.active) {
			passthroughFlag.active = false;
			return;
		}

		const result = engine.process(command, textParts.join("\n"));
		if (!result.matched) {
			try {
				api.events.emit(TOKEN_SAVER_UNMATCHED_EVENT, {
					command,
					byteCount: result.bytesBefore,
					timestamp: Date.now(),
				} satisfies UnmatchedEvent);
			} catch {}
			return;
		}

		try {
			api.events.emit(TOKEN_SAVER_FILTERED_EVENT, {
				command,
				bytesBefore: result.bytesBefore,
				bytesAfter: result.bytesAfter,
				timestamp: Date.now(),
			} satisfies FilterRecord);
		} catch {
			// listener errors must not break filtering
		}

		return {
			content: [{ type: "text", text: result.output }, ...otherContent],
		};
	});
}
