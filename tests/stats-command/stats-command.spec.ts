import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerStatsCommand } from "../../src/stats-command/index.js";
import type { StatsState } from "../../src/stats/index.js";

const makeMockApi = () => {
	let commandHandler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	let commandOpts: { description?: string; handler: unknown } | undefined;
	const sentMessages: { payload: unknown; options: unknown }[] = [];
	return {
		api: {
			registerCommand: vi.fn(
				(
					_name: string,
					opts: { description?: string; handler: (args: string, ctx: unknown) => Promise<void> },
				) => {
					commandOpts = opts;
					commandHandler = opts.handler;
				},
			),
			sendMessage: vi.fn((payload: unknown, options: unknown) => {
				sentMessages.push({ payload, options });
			}),
		},
		sentMessages,
		invoke: (args = "") => commandHandler?.(args, {}),
		commandOpts: () => commandOpts,
	};
};

let tmpPath: string;

beforeEach(() => {
	tmpPath = join(tmpdir(), `stats-cmd-${Date.now()}-${Math.random()}.json`);
});

afterEach(() => {
	try {
		rmSync(tmpPath);
	} catch {
		/* ok */
	}
});

const writeState = (state: StatsState) => {
	mkdirSync(dirname(tmpPath), { recursive: true });
	writeFileSync(tmpPath, JSON.stringify(state), "utf8");
};

describe("AC1 — registers 'token-saver:stats' with correct description (AC2)", () => {
	it("registers the command with name and description", () => {
		const { api, commandOpts } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		expect(api.registerCommand).toHaveBeenCalledWith(
			"token-saver:stats",
			expect.objectContaining({ handler: expect.any(Function) }),
		);
		expect(commandOpts()?.description).toBe("Show per-rule filter stats");
	});
});

describe("AC8 — empty / missing stats.json", () => {
	it("emits 'No stats recorded yet.' when file missing", async () => {
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke();
		expect(sentMessages).toHaveLength(1);
		expect((sentMessages[0]?.payload as { content: string }).content).toBe(
			"No stats recorded yet.",
		);
		expect((sentMessages[0]?.payload as { customType: string }).customType).toBe(
			"token-saver:stats",
		);
		expect((sentMessages[0]?.payload as { display: boolean }).display).toBe(true);
		expect(sentMessages[0]?.options).toEqual({ triggerTurn: false });
	});

	it("emits 'No stats recorded yet.' when rules object empty", async () => {
		writeState({ rules: {} });
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke();
		expect((sentMessages[0]?.payload as { content: string }).content).toBe(
			"No stats recorded yet.",
		);
	});
});

describe("AC12 — test seam: handler reads from the injected statsPath", () => {
	it("renders rules from the injected path (proves seam wired end-to-end)", async () => {
		writeState({
			rules: {
				"test-rule": {
					fired: 1,
					bytesIn: 1_000,
					bytesOut: 200,
					matchNoReduction: 0,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke();
		const content = (sentMessages[0]?.payload as { content: string }).content;
		expect(content).toContain("| test-rule |");
	});
});

describe("AC3,AC4 — populated stats: header + sort by bytesSaved desc, tiebreak by name asc", () => {
	it("renders the required markdown header", async () => {
		writeState({
			rules: {
				"git-status": {
					fired: 5,
					bytesIn: 10_000,
					bytesOut: 1_000,
					matchNoReduction: 0,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-10T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke();
		const content = (sentMessages[0]?.payload as { content: string }).content;
		expect(content).toContain("| Rule | Fired | Bytes saved | No-reduction | Reduction % |");
	});

	it("sorts by bytesSaved desc, ties broken by rule name asc", async () => {
		writeState({
			rules: {
				"b-rule": {
					fired: 1,
					bytesIn: 500,
					bytesOut: 400,
					matchNoReduction: 0,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
				"a-rule": {
					fired: 1,
					bytesIn: 500,
					bytesOut: 400,
					matchNoReduction: 0,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
				"big-saver": {
					fired: 1,
					bytesIn: 10_000,
					bytesOut: 1_000,
					matchNoReduction: 0,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke();
		const content = (sentMessages[0]?.payload as { content: string }).content;
		const bigIdx = content.indexOf("| big-saver |");
		const aIdx = content.indexOf("| a-rule |");
		const bIdx = content.indexOf("| b-rule |");
		expect(bigIdx).toBeGreaterThan(-1);
		expect(aIdx).toBeGreaterThan(-1);
		expect(bIdx).toBeGreaterThan(-1);
		expect(bigIdx).toBeLessThan(aIdx);
		expect(aIdx).toBeLessThan(bIdx);
	});
});

describe("AC5 — bytes saved formatted with en-US thousands separators; negative shown as-is", () => {
	it("formats large bytesSaved with commas", async () => {
		writeState({
			rules: {
				r: {
					fired: 1,
					bytesIn: 12_345,
					bytesOut: 45,
					matchNoReduction: 0,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke();
		const content = (sentMessages[0]?.payload as { content: string }).content;
		expect(content).toContain("12,300 B");
	});

	it("shows negative bytesSaved honestly (rule expanded output)", async () => {
		writeState({
			rules: {
				r: {
					fired: 1,
					bytesIn: 100,
					bytesOut: 112,
					matchNoReduction: 1,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke();
		const content = (sentMessages[0]?.payload as { content: string }).content;
		expect(content).toContain("-12 B");
	});
});

describe("AC6 — reduction %: integer percent, em-dash for bytesIn=0, honest negatives", () => {
	it("renders integer percent for positive reduction", async () => {
		writeState({
			rules: {
				r: {
					fired: 1,
					bytesIn: 1_000,
					bytesOut: 130,
					matchNoReduction: 0,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke();
		const content = (sentMessages[0]?.payload as { content: string }).content;
		expect(content).toContain("87%");
	});

	it("renders em-dash when bytesIn = 0 (ratio guard)", async () => {
		writeState({
			rules: {
				r: {
					fired: 1,
					bytesIn: 0,
					bytesOut: 0,
					matchNoReduction: 1,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke();
		const content = (sentMessages[0]?.payload as { content: string }).content;
		const rRow = content.split("\n").find((l) => l.startsWith("| r |"));
		expect(rRow).toBeDefined();
		expect(rRow).toContain("—");
	});

	it("renders negative percent when output expanded", async () => {
		writeState({
			rules: {
				r: {
					fired: 1,
					bytesIn: 100,
					bytesOut: 112,
					matchNoReduction: 1,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke();
		const content = (sentMessages[0]?.payload as { content: string }).content;
		expect(content).toContain("-12%");
	});
});

describe("AC7 — no-reduction column shows raw matchNoReduction count", () => {
	it("prints matchNoReduction as-is", async () => {
		writeState({
			rules: {
				r: {
					fired: 10,
					bytesIn: 1_000,
					bytesOut: 500,
					matchNoReduction: 3,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke();
		const content = (sentMessages[0]?.payload as { content: string }).content;
		const rRow = content.split("\n").find((l) => l.startsWith("| r |"));
		expect(rRow).toBeDefined();
		expect(rRow).toMatch(/\|\s*r\s*\|\s*10\s*\|\s*500 B\s*\|\s*3\s*\|\s*50%\s*\|/);
	});
});

describe("AC9 — --since filters rules by firstSeen >= since", () => {
	it("includes only rules introduced at/after the since date", async () => {
		writeState({
			rules: {
				"old-rule": {
					fired: 1,
					bytesIn: 1_000,
					bytesOut: 100,
					matchNoReduction: 0,
					firstSeen: "2026-03-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
				"new-rule": {
					fired: 1,
					bytesIn: 1_000,
					bytesOut: 200,
					matchNoReduction: 0,
					firstSeen: "2026-04-15T00:00:00.000Z",
					lastSeen: "2026-04-15T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke("--since 2026-04-01");
		const content = (sentMessages[0]?.payload as { content: string }).content;
		expect(content).toContain("| new-rule |");
		expect(content).not.toContain("| old-rule |");
	});

	it("accepts full ISO 8601 timestamps", async () => {
		writeState({
			rules: {
				"new-rule": {
					fired: 1,
					bytesIn: 1_000,
					bytesOut: 200,
					matchNoReduction: 0,
					firstSeen: "2026-04-15T12:00:00.000Z",
					lastSeen: "2026-04-15T12:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke("--since 2026-04-15T00:00:00.000Z");
		const content = (sentMessages[0]?.payload as { content: string }).content;
		expect(content).toContain("| new-rule |");
	});
});

describe("AC10 — invalid --since value emits error message listing accepted formats", () => {
	it("emits an error message without throwing", async () => {
		writeState({
			rules: {
				r: {
					fired: 1,
					bytesIn: 100,
					bytesOut: 50,
					matchNoReduction: 0,
					firstSeen: "2026-04-01T00:00:00.000Z",
					lastSeen: "2026-04-01T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await expect(invoke("--since not-a-date")).resolves.toBeUndefined();
		const content = (sentMessages[0]?.payload as { content: string }).content;
		expect(content.toLowerCase()).toContain("invalid");
		expect(content).toContain("YYYY-MM-DD");
		expect(content).toContain("ISO 8601");
	});
});

describe("AC11 — --since with all rules filtered out", () => {
	it("emits 'No rules match the --since filter.' (distinct from empty-stats)", async () => {
		writeState({
			rules: {
				"old-rule": {
					fired: 1,
					bytesIn: 1_000,
					bytesOut: 100,
					matchNoReduction: 0,
					firstSeen: "2026-03-01T00:00:00.000Z",
					lastSeen: "2026-03-01T00:00:00.000Z",
				},
			},
		});
		const { api, invoke, sentMessages } = makeMockApi();
		registerStatsCommand(api as never, { statsPath: tmpPath });
		await invoke("--since 2026-12-01");
		const content = (sentMessages[0]?.payload as { content: string }).content;
		expect(content).toBe("No rules match the --since filter.");
	});
});
