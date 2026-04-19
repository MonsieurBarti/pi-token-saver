import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_UNMATCHED_CAP,
	DEFAULT_UNMATCHED_LOG_PATH,
	type UnmatchedRecord,
	_resetUnmatchedWarnedForTest,
	appendUnmatched,
	pruneUnmatchedIfNeeded,
	readUnmatched,
} from "../../src/discover-command/storage.js";

const tmpLog = join(tmpdir(), `unmatched-test-${process.pid}.jsonl`);

const makeRecord = (overrides: Partial<UnmatchedRecord> = {}): UnmatchedRecord => ({
	sessionId: 1,
	timestamp: 1000,
	command: "echo hello",
	commandKey: "echo hello",
	projectCwd: "/tmp/test",
	byteCount: 100,
	...overrides,
});

beforeEach(() => {
	_resetUnmatchedWarnedForTest();
	try {
		unlinkSync(tmpLog);
	} catch {}
});

describe("appendUnmatched / readUnmatched", () => {
	it("appends and reads back a record", () => {
		const rec = makeRecord();
		appendUnmatched(rec, tmpLog);
		const records = readUnmatched(tmpLog);
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject(rec);
	});

	it("returns [] when file does not exist", () => {
		expect(readUnmatched(tmpLog)).toEqual([]);
	});

	it("skips malformed lines", () => {
		writeFileSync(tmpLog, "not-json\n");
		const records = readUnmatched(tmpLog);
		expect(records).toHaveLength(0);
	});
});

describe("pruneUnmatchedIfNeeded", () => {
	it("does nothing when under cap", () => {
		appendUnmatched(makeRecord(), tmpLog);
		pruneUnmatchedIfNeeded(10, tmpLog);
		expect(readUnmatched(tmpLog)).toHaveLength(1);
	});

	it("prunes to 90% when at or over cap", () => {
		for (let i = 0; i < 10; i++) appendUnmatched(makeRecord({ command: `cmd ${i}` }), tmpLog);
		pruneUnmatchedIfNeeded(10, tmpLog);
		expect(readUnmatched(tmpLog)).toHaveLength(9);
	});
});

describe("defaults", () => {
	it("DEFAULT_UNMATCHED_LOG_PATH ends with unmatched.jsonl", () => {
		expect(DEFAULT_UNMATCHED_LOG_PATH).toMatch(/unmatched\.jsonl$/);
	});

	it("DEFAULT_UNMATCHED_CAP is 10_000", () => {
		expect(DEFAULT_UNMATCHED_CAP).toBe(10_000);
	});
});
