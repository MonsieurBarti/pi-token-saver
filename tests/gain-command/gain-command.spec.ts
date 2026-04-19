import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGainCommand } from "../../src/gain-command/index.js";

// ── Mock factory ────────────────────────────────────────────────────────────────

const makeMockApi = () => {
	let commandHandler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	const sentMessages: unknown[] = [];
	return {
		api: {
			registerCommand: vi.fn(
				(_name: string, opts: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
					commandHandler = opts.handler;
				},
			),
			sendMessage: vi.fn((msg: unknown) => {
				sentMessages.push(msg);
			}),
		},
		sentMessages,
		invoke: (args = "") => commandHandler?.(args, {}),
	};
};

// ── Fixtures ─────────────────────────────────────────────────────────────────────

const SESSION_ID = 123_456;

const makeRecord = (
	overrides: Partial<{
		sessionId: number;
		commandName: string;
		bytesBefore: number;
		bytesAfter: number;
	}> = {},
) => ({
	sessionId: SESSION_ID,
	timestamp: Date.now(),
	command: "git status",
	commandName: "git",
	projectCwd: "/tmp/proj",
	bytesBefore: 1000,
	bytesAfter: 200,
	...overrides,
});

let tmpLog: string;

beforeEach(() => {
	tmpLog = join(tmpdir(), `gain-test-${Date.now()}-${Math.random()}.jsonl`);
});

afterEach(() => {
	try {
		rmSync(tmpLog);
	} catch {
		/* ok */
	}
});

const writeRecords = (records: ReturnType<typeof makeRecord>[]) => {
	mkdirSync(tmpdir(), { recursive: true });
	writeFileSync(tmpLog, `${records.map((r) => JSON.stringify(r)).join("\n")}\n`, "utf8");
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AC1 — registerCommand called with 'token-saver:gain'", () => {
	it("registers the command with the correct name", () => {
		const { api } = makeMockApi();
		registerGainCommand(api as never, SESSION_ID, { logPath: tmpLog });
		expect(api.registerCommand).toHaveBeenCalledWith(
			"token-saver:gain",
			expect.objectContaining({ handler: expect.any(Function) }),
		);
	});
});

describe("AC2 — sendMessage called with triggerTurn: false and display: true", () => {
	it("injects message with triggerTurn: false and display: true (boolean)", async () => {
		writeRecords([makeRecord()]);
		const { api, invoke, sentMessages } = makeMockApi();
		registerGainCommand(api as never, SESSION_ID, { logPath: tmpLog });
		await invoke();
		expect(api.sendMessage).toHaveBeenCalledWith(expect.anything(), { triggerTurn: false });
		expect((sentMessages[0] as { display: boolean }).display).toBe(true);
	});
});

describe("AC3 — session totals: bytes saved + est tokens", () => {
	it("shows session byte and token totals", async () => {
		writeRecords([makeRecord({ bytesBefore: 1000, bytesAfter: 200 })]);
		const { api, invoke, sentMessages } = makeMockApi();
		registerGainCommand(api as never, SESSION_ID, { logPath: tmpLog });
		await invoke();
		const content = (sentMessages[0] as { content: string }).content;
		expect(content).toContain("800 B"); // 1000 - 200 = 800
		expect(content).toContain("~200"); // Math.round(800 / 4) = 200
	});
});

describe("AC4 — per-command breakdown sorted descending", () => {
	it("shows git before ls (git saves more)", async () => {
		writeRecords([
			makeRecord({ commandName: "ls", bytesBefore: 500, bytesAfter: 100 }), // 400 saved
			makeRecord({ commandName: "git", bytesBefore: 2000, bytesAfter: 500 }), // 1500 saved
		]);
		const { api, invoke, sentMessages } = makeMockApi();
		registerGainCommand(api as never, SESSION_ID, { logPath: tmpLog });
		await invoke();
		const content = (sentMessages[0] as { content: string }).content;
		const gitIdx = content.indexOf("| git |");
		const lsIdx = content.indexOf("| ls |");
		expect(gitIdx).toBeGreaterThan(-1);
		expect(lsIdx).toBeGreaterThan(-1);
		expect(gitIdx).toBeLessThan(lsIdx);
	});
});

describe("AC5 — historical aggregate across all sessions", () => {
	it("sums bytes across all sessions", async () => {
		writeRecords([
			makeRecord({ sessionId: SESSION_ID, bytesBefore: 1000, bytesAfter: 200 }), // 800
			makeRecord({ sessionId: 999, bytesBefore: 2000, bytesAfter: 500 }), // 1500
		]);
		const { api, invoke, sentMessages } = makeMockApi();
		registerGainCommand(api as never, SESSION_ID, { logPath: tmpLog });
		await invoke();
		const content = (sentMessages[0] as { content: string }).content;
		// Total: 800 + 1500 = 2300 → "2,300 B"
		expect(content).toContain("2,300 B");
	});
});

describe("AC6 — no records: 'No savings recorded yet.'", () => {
	it("injects exact string when log is missing", async () => {
		const { api, invoke, sentMessages } = makeMockApi();
		registerGainCommand(api as never, SESSION_ID, { logPath: tmpLog });
		await invoke();
		expect((sentMessages[0] as { content: string }).content).toBe("No savings recorded yet.");
	});
});

describe("AC7 — session empty, historical exists: zeroed session + populated historical", () => {
	it("shows 0 B for session and historical total for other session", async () => {
		writeRecords([makeRecord({ sessionId: 999, bytesBefore: 2000, bytesAfter: 500 })]); // 1500
		const { api, invoke, sentMessages } = makeMockApi();
		registerGainCommand(api as never, SESSION_ID, { logPath: tmpLog });
		await invoke();
		const content = (sentMessages[0] as { content: string }).content;
		expect(content).toContain("| Bytes saved | 0 B |");
		expect(content).toContain("1,500 B");
	});
});

describe("AC8 — readRecords never throws: missing log and corrupt lines", () => {
	it("handles missing log gracefully", async () => {
		const { api, invoke, sentMessages } = makeMockApi();
		registerGainCommand(api as never, SESSION_ID, { logPath: "/tmp/nonexistent-gain-test.jsonl" });
		await expect(invoke()).resolves.not.toThrow();
		expect(sentMessages).toHaveLength(1);
	});

	it("handles corrupt JSONL lines gracefully (valid lines still counted)", async () => {
		writeFileSync(
			tmpLog,
			`${JSON.stringify(makeRecord({ bytesBefore: 1000, bytesAfter: 200 }))}\nnot-valid-json\n`,
			"utf8",
		);
		const { api, invoke, sentMessages } = makeMockApi();
		registerGainCommand(api as never, SESSION_ID, { logPath: tmpLog });
		await expect(invoke()).resolves.not.toThrow();
		const content = (sentMessages[0] as { content: string }).content;
		expect(content).toContain("800 B"); // valid line still processed
	});
});
