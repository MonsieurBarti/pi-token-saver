import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import { isBashToolResult } from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createRegistry } from "./command-registry/index.js";
import { FilterEngine } from "./filter-engine/index.js";

export const TOKEN_SAVER_FILTERED_EVENT = "token-saver:filtered";

export interface FilterRecord {
	command: string;
	bytesBefore: number;
	bytesAfter: number;
	timestamp: number;
}

export function registerHook(api: ExtensionAPI): void {
	const engine = new FilterEngine(createRegistry());

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
		if (textParts.length === 0) return;

		const result = engine.process(command, textParts.join("\n"));
		if (!result.matched) return;

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
