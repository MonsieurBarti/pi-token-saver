import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type FilterRecord,
	IMAGE_ONLY_FALLBACK,
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

const armPassthrough = async (mock: ReturnType<typeof makeMockApi>) => {
	const call = (mock.api.registerCommand as ReturnType<typeof vi.fn>).mock.calls.find(
		(args: string[]) => args[0] === "token-saver:passthrough",
	);
	await call?.[1].handler("", {});
};

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

describe("AC-08 — image-only fallback", () => {
	const image = {
		type: "image",
		source: { type: "base64", media_type: "image/png", data: "abc" },
	};

	it("matched command with custom fallback → fallback text + image, no event", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);
		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "git log --oneline" },
			content: [image],
			isError: false,
			details: undefined,
		}) as { content: unknown[] } | undefined;
		expect(result?.content).toHaveLength(2);
		expect(result?.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("--no-pager"),
		});
		expect(result?.content[1]).toEqual(image);
		expect(mock.emitted).toHaveLength(0);
	});

	it("matched command without custom fallback → generic fallback text + image, no event", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);
		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "git diff HEAD" },
			content: [image],
			isError: false,
			details: undefined,
		}) as { content: unknown[] } | undefined;
		expect(result?.content).toHaveLength(2);
		expect(result?.content[0]).toMatchObject({
			type: "text",
			text: IMAGE_ONLY_FALLBACK,
		});
		expect(result?.content[1]).toEqual(image);
		expect(mock.emitted).toHaveLength(0);
	});

	it("unmatched command → undefined, no event", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);
		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "echo hello" },
			content: [image],
			isError: false,
			details: undefined,
		});
		expect(result).toBeUndefined();
		expect(mock.emitted).toHaveLength(0);
	});

	it("passthrough active + image-only → undefined, flag not consumed (next text also bypassed)", async () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);
		await armPassthrough(mock);
		const imageResult = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "git log --oneline" },
			content: [image],
			isError: false,
			details: undefined,
		});
		expect(imageResult).toBeUndefined();
		const textResult = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-2",
			toolName: "bash",
			input: { command: "git log --oneline" },
			content: [{ type: "text", text: GIT_LOG_VERBOSE }],
			isError: false,
			details: undefined,
		});
		expect(textResult).toBeUndefined();
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

describe("AC13 defense-in-depth — engine.process error does not crash the tool_result handler", () => {
	// Producing a throwing engine.process via the public API would require
	// either modifying filter-engine (forbidden) or injecting a broken rule
	// through the config system. The coercion guards in config/index.ts now
	// prevent invalid regex values from reaching the engine, so constructing
	// a rule that throws at process-time via the normal code path is no longer
	// straightforward without modifying the engine. We therefore verify the
	// defense-in-depth path by monkey-patching the FilterEngine prototype
	// after registerHook wires everything up.
	it("returns undefined (unfiltered passthrough) when engine.process throws", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		// Import FilterEngine so we can patch its prototype
		const { FilterEngine } = await import("../src/filter-engine/index.js");
		const original = FilterEngine.prototype.process;
		FilterEngine.prototype.process = () => {
			throw new Error("simulated engine failure");
		};

		try {
			const result = mock.invoke({
				type: "tool_result",
				toolCallId: "tc-dib",
				toolName: "bash",
				input: { command: "git log --oneline" },
				content: [{ type: "text", text: GIT_LOG_VERBOSE }],
				isError: false,
				details: undefined,
			});

			// Handler must not throw; result is undefined (unfiltered passthrough)
			expect(result).toBeUndefined();
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining("[token-saver] Filter engine error"),
				expect.any(Error),
			);
			// No savings event emitted
			expect(mock.emitted).toHaveLength(0);
		} finally {
			FilterEngine.prototype.process = original;
			warn.mockRestore();
		}
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

describe("AC13 — user config rule filters hook output end-to-end", () => {
	const createdDirs: string[] = [];
	const originalHome = process.env.HOME;

	afterEach(() => {
		vi.restoreAllMocks();
		process.env.HOME = originalHome;
		for (const dir of createdDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("applies a user-defined rule from a temp project config to tool_result output", () => {
		const tmpProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-hook-cfg-"));
		const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-hook-home-"));
		createdDirs.push(tmpProjectRoot, tmpHome);

		const settingsDir = path.join(tmpProjectRoot, ".pi", "token-saver");
		fs.mkdirSync(settingsDir, { recursive: true });
		const userRule = {
			rules: [
				{
					name: "user-ac13",
					matchCommand: "^echo ac13-marker",
					pipeline: { maxLines: 1 },
				},
			],
		};
		fs.writeFileSync(path.join(settingsDir, "settings.json"), JSON.stringify(userRule), "utf8");

		vi.spyOn(process, "cwd").mockReturnValue(tmpProjectRoot);
		process.env.HOME = tmpHome;

		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		const result = mock.invoke({
			type: "tool_result",
			toolCallId: "tc-ac13",
			toolName: "bash",
			input: { command: "echo ac13-marker" },
			content: [{ type: "text", text: "line1\nline2\nline3\nline4" }],
			isError: false,
			details: undefined,
		}) as { content: Array<{ type: string; text: string }> } | undefined;

		expect(result).toBeDefined();
		const textOut = result?.content[0]?.text ?? "";
		expect(textOut).toContain("line1");
		expect(textOut).not.toContain("line4");
		expect(mock.emitted).toHaveLength(1);
		expect(mock.emitted[0]?.event).toBe(TOKEN_SAVER_FILTERED_EVENT);
	});
});

describe("AC-ruleName — FilterRecord emitted with ruleName from matched rule", () => {
	it("includes ruleName on the emitted FilterRecord", () => {
		const mock = makeMockApi();
		registerHook(mock.api as unknown as ExtensionAPI);

		mock.invoke({
			type: "tool_result",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "git log --oneline" },
			content: [{ type: "text", text: GIT_LOG_VERBOSE }],
			isError: false,
			details: undefined,
		});

		const record = mock.emitted[0]?.data as FilterRecord;
		expect(typeof record.ruleName).toBe("string");
		expect(record.ruleName.length).toBeGreaterThan(0);
	});
});
