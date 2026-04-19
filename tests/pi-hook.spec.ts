import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
	type FilterRecord,
	TOKEN_SAVER_FILTERED_EVENT,
	TOKEN_SAVER_UNMATCHED_EVENT,
	registerHook,
} from "../src/pi-hook.js";

// ── Mock factory ─────────────────────────────────────────────────────────────

const makeMockApi = () => {
	const emitted: Array<{ event: string; data: unknown }> = [];
	let toolResultHandler: ((event: unknown, ctx: unknown) => unknown) | undefined;
	const api = {
		on: vi.fn((event: string, handler: (e: unknown, ctx: unknown) => unknown) => {
			if (event === "tool_result") toolResultHandler = handler;
		}),
		events: {
			emit: vi.fn((event: string, data: unknown) => {
				emitted.push({ event, data });
			}),
			on: vi.fn(),
		},
		registerCommand: vi.fn(),
		sendMessage: vi.fn(),
	};
	return {
		api,
		emitted,
		invoke: (event: unknown) => toolResultHandler?.(event, {}),
	};
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Verbose git log — blank lines and diff stats are stripped by the git-log rule
const GIT_LOG_VERBOSE = [
	"commit a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
	"Author: Alice Smith <alice@example.com>",
	"Date:   Mon Apr 15 14:32:01 2024 +0200",
	"",
	"    feat: add authentication middleware",
	"",
	" src/auth/middleware.ts    | 85 +++++++++",
	" 1 file changed, 85 insertions(+)",
].join("\n");

// Vitest all-pass output — triggers matchOutput short-circuit
const VITEST_ALL_PASS = [
	"✓ src/auth/login.spec.ts (3 tests) 12ms",
	"✓ src/auth/middleware.spec.ts (5 tests) 45ms",
	"",
	"Test Files  3 passed (3)",
	"Tests       10 passed (10)",
	"Duration    65ms",
].join("\n");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AC-01 — matched bash command: filtered content + FilterRecord emitted", () => {
	it("returns content with filtered text and emits FilterRecord on the event bus", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "git log --oneline" },
			content: [{ type: "text", text: GIT_LOG_VERBOSE }],
			isError: false,
			details: undefined,
		});

		expect(result).toMatchObject({ content: [{ type: "text", text: expect.any(String) }] });
		expect(mock.emitted).toHaveLength(1);
		expect(TOKEN_SAVER_FILTERED_EVENT).toBe("token-saver:filtered"); // literal value guard
		expect(mock.emitted[0]?.event).toBe(TOKEN_SAVER_FILTERED_EVENT);
		const record = mock.emitted[0]?.data as FilterRecord;
		expect(record.command).toBe("git log --oneline");
		expect(record.bytesAfter).toBeLessThan(record.bytesBefore);
		expect(typeof record.timestamp).toBe("number");
	});
});

describe("AC-02 — no matching rule: undefined + unmatched event emitted", () => {
	it("returns undefined and emits unmatched event when no rule matches", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "echo hello" },
			content: [{ type: "text", text: "hello" }],
			isError: false,
			details: undefined,
		});

		expect(result).toBeUndefined();
		expect(mock.emitted).toHaveLength(1);
		expect(mock.emitted[0]?.event).toBe(TOKEN_SAVER_UNMATCHED_EVENT);
	});
});

describe("AC-03 — isError:true: undefined + no event", () => {
	it("passes through without filtering when isError is true", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "git log --oneline" },
			content: [{ type: "text", text: GIT_LOG_VERBOSE }],
			isError: true,
			details: undefined,
		});

		expect(result).toBeUndefined();
		expect(mock.emitted).toHaveLength(0);
	});
});

describe("AC-04 — non-bash tool: undefined", () => {
	it("returns undefined for read tool results", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-2",
			toolName: "read",
			input: { path: "/foo.ts" },
			content: [{ type: "text", text: "file contents" }],
			isError: false,
			details: undefined,
		});

		expect(result).toBeUndefined();
	});
});

describe("AC-05 — multiple text items + image: concat/filter + image at tail", () => {
	it("concatenates text parts, filters, returns single text item with image preserved at tail", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		const image = {
			type: "image",
			source: { type: "base64", media_type: "image/png", data: "abc" },
		};
		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "git log --oneline" },
			content: [
				{ type: "text", text: "commit a1b2c3\nAuthor: Alice <a@b.com>\n" },
				{ type: "text", text: "Date:   2024-01-01\n    feat: foo\n" },
				image,
			],
			isError: false,
			details: undefined,
		}) as { content: unknown[] } | undefined;

		expect(result).toBeDefined();
		expect(result?.content).toHaveLength(2);
		expect(result?.content[0]).toMatchObject({ type: "text" });
		expect(result?.content[1]).toEqual(image);
	});

	it("unmatched rule with mixed content → undefined, original content untouched", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "echo hello" },
			content: [
				{ type: "text", text: "hello" },
				{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
			],
			isError: false,
			details: undefined,
		});

		expect(result).toBeUndefined();
	});
});

describe("AC-06 — non-string command: undefined", () => {
	it("returns undefined when input.command is not a string", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: 42 },
			content: [{ type: "text", text: "output" }],
			isError: false,
			details: undefined,
		});

		expect(result).toBeUndefined();
	});
});

describe("AC-08 — zero text items: undefined + no event", () => {
	it("returns undefined when content has no text items", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "git log --oneline" },
			content: [
				{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
			],
			isError: false,
			details: undefined,
		});

		expect(result).toBeUndefined();
		expect(mock.emitted).toHaveLength(0);
	});
});

describe("AC-09 — matchOutput short-circuit: image preserved at tail", () => {
	it("returns short-circuit message as single text + real image item at tail", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		const image = {
			type: "image",
			source: { type: "base64", media_type: "image/png", data: "xyz" },
		};
		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "npx vitest run" },
			content: [{ type: "text", text: VITEST_ALL_PASS }, image],
			isError: false,
			details: undefined,
		}) as { content: unknown[] } | undefined;

		expect(result).toBeDefined();
		expect(result?.content).toHaveLength(2);
		expect(result?.content[0]).toEqual({ type: "text", text: "All tests passed." });
		expect(result?.content[1]).toEqual(image);
	});
});

describe("AC-wiring — registerHook wires /token-saver:gain command", () => {
	it("calls api.registerCommand with 'token-saver:gain'", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);
		expect(mock.api.registerCommand).toHaveBeenCalledWith(
			"token-saver:gain",
			expect.objectContaining({ handler: expect.any(Function) }),
		);
	});
});

import extension from "../src/index.js";

describe("AC-07 — src/index.ts wires registerHook into the PI entry point", () => {
	it("default export calls registerHook by subscribing to tool_result", () => {
		const mock = makeMockApi();
		extension(mock.api as unknown as ExtensionAPI);
		expect(mock.api.on).toHaveBeenCalledWith("tool_result", expect.any(Function));
	});
});

describe("AC7 — registerHook constructs SavingsTracker subscribed to filter events", () => {
	it("calls api.events.on with TOKEN_SAVER_FILTERED_EVENT", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);
		expect(mock.api.events.on).toHaveBeenCalledWith(
			TOKEN_SAVER_FILTERED_EVENT,
			expect.any(Function),
		);
	});

	it("registerHook return value is undefined (void)", () => {
		const mock = makeMockApi();
		const result = registerHook(mock.api as unknown as ExtensionAPI);
		expect(result).toBeUndefined();
	});
});

describe("AC-wiring — registerHook wires /token-saver:passthrough command", () => {
	it("calls api.registerCommand with 'token-saver:passthrough'", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);
		expect(mock.api.registerCommand).toHaveBeenCalledWith(
			"token-saver:passthrough",
			expect.objectContaining({ handler: expect.any(Function) }),
		);
	});
});

describe("AC-bypass — passthrough flag bypasses filtering for the next matched command", () => {
	const makeMatchedEvent = () => ({
		type: "tool_result",
		toolCallId: "tc-bypass",
		toolName: "bash",
		input: { command: "git log --oneline" },
		content: [{ type: "text", text: GIT_LOG_VERBOSE }],
		isError: false,
		details: undefined,
	});

	const armPassthrough = async (mock: ReturnType<typeof makeMockApi>) => {
		const call = (mock.api.registerCommand as ReturnType<typeof vi.fn>).mock.calls.find(
			(args: string[]) => args[0] === "token-saver:passthrough",
		);
		await call?.[1].handler("", {});
	};

	it("returns undefined (no replacement) when flag is armed and command would match", async () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);
		await armPassthrough(mock);
		const result = mock.invoke(makeMatchedEvent());
		expect(result).toBeUndefined();
	});

	it("emits no savings event when bypassed", async () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);
		await armPassthrough(mock);
		mock.invoke(makeMatchedEvent());
		expect(mock.emitted).toHaveLength(0);
	});

	it("resumes filtering after one bypassed command", async () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);
		await armPassthrough(mock);
		mock.invoke(makeMatchedEvent()); // first: bypassed
		const result = mock.invoke(makeMatchedEvent()); // second: filtered
		expect(result).toBeDefined();
		expect(mock.emitted).toHaveLength(1);
	});
});
