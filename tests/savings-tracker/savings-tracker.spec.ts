import { EventEmitter } from "node:events";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FilterRecord, TOKEN_SAVER_FILTERED_EVENT } from "../../src/pi-hook.js";
import { SavingsTracker } from "../../src/savings-tracker/index.js";
import { _resetWarnedForTest, readRecords } from "../../src/savings-tracker/storage.js";

let tmpLog: string;

const makeFilterRecord = (command: string): FilterRecord => ({
	ruleName: "test-rule",
	command,
	bytesBefore: 500,
	bytesAfter: 100,
	timestamp: Date.now(),
});

beforeEach(() => {
	tmpLog = join(tmpdir(), `st-test-${Date.now()}-${Math.random()}.jsonl`);
	_resetWarnedForTest();
});

afterEach(() => {
	try {
		rmSync(tmpLog);
	} catch {
		/* ok */
	}
});

describe("AC2 — record shape", () => {
	it("writes a record with all 7 fields and correct types", () => {
		const events = new EventEmitter();
		const sessionId = 12345;
		new SavingsTracker(events, sessionId, { logPath: tmpLog });
		events.emit(TOKEN_SAVER_FILTERED_EVENT, makeFilterRecord("git status"));
		const records = readRecords(tmpLog);
		expect(records).toHaveLength(1);
		const rec = records[0];
		expect(typeof rec?.sessionId).toBe("number");
		expect(typeof rec?.timestamp).toBe("number");
		expect(typeof rec?.command).toBe("string");
		expect(typeof rec?.commandName).toBe("string");
		expect(typeof rec?.projectCwd).toBe("string");
		expect(typeof rec?.bytesBefore).toBe("number");
		expect(typeof rec?.bytesAfter).toBe("number");
		expect(rec?.sessionId).toBe(sessionId);
	});
});

describe("AC3 — commandName extraction", () => {
	it.each([
		["git status", "git"],
		["  git log --oneline", "git"],
		["bun run test", "bun"],
		["", ""],
	])("commandName('%s') === '%s'", (command, expected) => {
		const events = new EventEmitter();
		new SavingsTracker(events, 1, { logPath: tmpLog });
		events.emit(TOKEN_SAVER_FILTERED_EVENT, makeFilterRecord(command));
		const records = readRecords(tmpLog);
		expect(records[0]?.commandName).toBe(expected);
	});
});

describe("AC4 — prune called before first append of session", () => {
	it("prunes when log already at cap before writing first record of new session", () => {
		const cap = 5;
		const events1 = new EventEmitter();
		new SavingsTracker(events1, 1, { logPath: tmpLog, cap });
		for (let i = 0; i < cap; i++) {
			events1.emit(TOKEN_SAVER_FILTERED_EVENT, makeFilterRecord(`cmd-${i}`));
		}
		expect(readRecords(tmpLog)).toHaveLength(cap);

		const events2 = new EventEmitter();
		new SavingsTracker(events2, 2, { logPath: tmpLog, cap });
		events2.emit(TOKEN_SAVER_FILTERED_EVENT, makeFilterRecord("cmd-new"));
		const after = readRecords(tmpLog);
		expect(after.length).toBeLessThan(cap + 1);
	});
});
