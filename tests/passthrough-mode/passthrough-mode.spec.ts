import { describe, expect, it, vi } from "vitest";
import {
	createPassthroughFlag,
	registerPassthroughCommand,
} from "../../src/passthrough-mode/index.js";

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

describe("AC1 — registerCommand called with 'token-saver:passthrough'", () => {
	it("registers command with correct name", () => {
		const { api } = makeMockApi();
		const flag = createPassthroughFlag();
		registerPassthroughCommand(api as never, flag);
		expect(api.registerCommand).toHaveBeenCalledWith(
			"token-saver:passthrough",
			expect.objectContaining({ handler: expect.any(Function) }),
		);
	});
});

describe("AC2 — invoking command sets flag.active = true", () => {
	it("arms the flag on invoke", async () => {
		const { api, invoke } = makeMockApi();
		const flag = createPassthroughFlag();
		registerPassthroughCommand(api as never, flag);
		expect(flag.active).toBe(false);
		await invoke();
		expect(flag.active).toBe(true);
	});
});

describe("AC3 — sends confirmation with triggerTurn: false and display: true", () => {
	it("injects confirmation message with correct options", async () => {
		const { api, invoke, sentMessages } = makeMockApi();
		const flag = createPassthroughFlag();
		registerPassthroughCommand(api as never, flag);
		await invoke();
		expect(api.sendMessage).toHaveBeenCalledWith(expect.anything(), { triggerTurn: false });
		expect((sentMessages[0] as { display: boolean }).display).toBe(true);
	});
});

describe("AC4 — confirmation message mentions passthrough or bypass", () => {
	it("content mentions passthrough or bypass", async () => {
		const { api, invoke, sentMessages } = makeMockApi();
		const flag = createPassthroughFlag();
		registerPassthroughCommand(api as never, flag);
		await invoke();
		const content = (sentMessages[0] as { content: string }).content.toLowerCase();
		expect(content).toMatch(/passthrough|bypass/);
	});
});

describe("AC5 — re-arming: flag is set each time command is invoked", () => {
	it("re-arms after manual reset", async () => {
		const { api, invoke } = makeMockApi();
		const flag = createPassthroughFlag();
		registerPassthroughCommand(api as never, flag);
		await invoke();
		flag.active = false; // simulate hook consuming the flag
		await invoke();
		expect(flag.active).toBe(true);
	});
});
