import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscoverTracker, registerDiscoverCommand } from "../../src/discover-command/index.js";
import { _resetUnmatchedWarnedForTest, readUnmatched } from "../../src/discover-command/storage.js";
import { TOKEN_SAVER_UNMATCHED_EVENT, type UnmatchedEvent } from "../../src/pi-hook.js";

const tmpLog = join(tmpdir(), `discover-cmd-test-${process.pid}.jsonl`);

const makeEvents = () => {
	const listeners = new Map<string, ((data: unknown) => void)[]>();
	return {
		on: vi.fn((channel: string, handler: (data: unknown) => void) => {
			if (!listeners.has(channel)) listeners.set(channel, []);
			listeners.get(channel)?.push(handler);
		}),
		emit: (channel: string, data: unknown) => {
			for (const h of listeners.get(channel) ?? []) h(data);
		},
	};
};

const makeApi = () => {
	const messages: Array<{ msg: unknown; opts: unknown }> = [];
	let capturedHandler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	const api = {
		registerCommand: vi.fn(
			(_name: string, opts: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
				capturedHandler = opts.handler;
			},
		),
		sendMessage: vi.fn((msg: unknown, opts: unknown) => {
			messages.push({ msg, opts });
		}),
	};
	return { api, messages, invoke: (args = "") => capturedHandler?.(args, {}) };
};

const ev = (command: string, byteCount: number): UnmatchedEvent => ({
	command,
	byteCount,
	timestamp: 1000,
});

beforeEach(() => {
	_resetUnmatchedWarnedForTest();
	try {
		unlinkSync(tmpLog);
	} catch {}
});

describe("DiscoverTracker", () => {
	it("subscribes to TOKEN_SAVER_UNMATCHED_EVENT", () => {
		const events = makeEvents();
		new DiscoverTracker(events, 1, { logPath: tmpLog });
		expect(events.on).toHaveBeenCalledWith(TOKEN_SAVER_UNMATCHED_EVENT, expect.any(Function));
	});

	it("appends record with commandKey (first two words) when event fires", () => {
		const events = makeEvents();
		new DiscoverTracker(events, 1, { logPath: tmpLog });
		events.emit(TOKEN_SAVER_UNMATCHED_EVENT, ev("git diff HEAD", 4096));
		const records = readUnmatched(tmpLog);
		expect(records).toHaveLength(1);
		expect(records[0]?.commandKey).toBe("git diff");
		expect(records[0]?.byteCount).toBe(4096);
	});

	it("single-word command → commandKey equals that word", () => {
		const events = makeEvents();
		new DiscoverTracker(events, 1, { logPath: tmpLog });
		events.emit(TOKEN_SAVER_UNMATCHED_EVENT, ev("make", 2000));
		const records = readUnmatched(tmpLog);
		expect(records[0]?.commandKey).toBe("make");
	});
});

describe("registerDiscoverCommand", () => {
	it("registers token-saver:discover", () => {
		const { api } = makeApi();
		registerDiscoverCommand(api as unknown as ExtensionAPI, 1, { logPath: tmpLog });
		expect(api.registerCommand).toHaveBeenCalledWith(
			"token-saver:discover",
			expect.objectContaining({ handler: expect.any(Function) }),
		);
	});

	it("sends empty-state message when log is empty", async () => {
		const { api, messages, invoke } = makeApi();
		registerDiscoverCommand(api as unknown as ExtensionAPI, 1, { logPath: tmpLog });
		await invoke();
		expect(messages[0]?.msg).toMatchObject({
			customType: "token-saver:discover",
			content: "No unmatched commands recorded yet.",
			display: true,
		});
		expect(messages[0]?.opts).toMatchObject({ triggerTurn: false });
	});

	it("report sorted by avg byteCount descending: cargo build before git diff", async () => {
		const events = makeEvents();
		new DiscoverTracker(events, 1, { logPath: tmpLog });
		events.emit(TOKEN_SAVER_UNMATCHED_EVENT, ev("cargo build --release", 18000));
		events.emit(TOKEN_SAVER_UNMATCHED_EVENT, ev("cargo build", 19000));
		events.emit(TOKEN_SAVER_UNMATCHED_EVENT, ev("cargo build --debug", 17000));
		events.emit(TOKEN_SAVER_UNMATCHED_EVENT, ev("git diff HEAD", 2000));

		const { api, messages, invoke } = makeApi();
		registerDiscoverCommand(api as unknown as ExtensionAPI, 1, { logPath: tmpLog });
		await invoke();

		const content = (messages[0]?.msg as { content: string }).content;
		expect(content).toContain("cargo build");
		expect(content).toContain("git diff");
		expect(content.indexOf("cargo build")).toBeLessThan(content.indexOf("git diff"));
	});

	it("KB values use (n / 1024).toFixed(1) format", async () => {
		const events = makeEvents();
		new DiscoverTracker(events, 1, { logPath: tmpLog });
		events.emit(TOKEN_SAVER_UNMATCHED_EVENT, ev("echo hi", 512));

		const { api, messages, invoke } = makeApi();
		registerDiscoverCommand(api as unknown as ExtensionAPI, 1, { logPath: tmpLog });
		await invoke();

		const content = (messages[0]?.msg as { content: string }).content;
		expect(content).toContain("0.5 KB");
	});
});
