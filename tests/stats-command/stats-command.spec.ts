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
