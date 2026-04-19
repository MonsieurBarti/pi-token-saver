import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type SavingsRecord,
	_resetWarnedForTest,
	appendRecord,
	pruneIfNeeded,
	readRecords,
} from "../../src/savings-tracker/storage.js";

const makeRecord = (overrides: Partial<SavingsRecord> = {}): SavingsRecord => ({
	sessionId: 1000,
	timestamp: 2000,
	command: "git status",
	commandName: "git",
	projectCwd: "/repo",
	bytesBefore: 500,
	bytesAfter: 100,
	...overrides,
});

let tmpLog: string;

beforeEach(() => {
	tmpLog = join(tmpdir(), `savings-test-${Date.now()}-${Math.random()}.jsonl`);
	_resetWarnedForTest();
});

afterEach(() => {
	try {
		rmSync(tmpLog);
	} catch {
		/* ok if missing */
	}
});

describe("AC1 + AC2 — appendRecord writes a valid SavingsRecord line", () => {
	it("appends one JSON line per call with all 7 fields", () => {
		const rec = makeRecord();
		appendRecord(rec, tmpLog);
		const content = readFileSync(tmpLog, "utf8");
		const parsed = JSON.parse(content.trim()) as SavingsRecord;
		expect(parsed).toEqual(rec);
	});

	it("appends multiple records as separate lines", () => {
		appendRecord(makeRecord({ command: "git diff" }), tmpLog);
		appendRecord(makeRecord({ command: "git log" }), tmpLog);
		const lines = readFileSync(tmpLog, "utf8").trim().split("\n");
		expect(lines).toHaveLength(2);
	});

	it("creates parent directory if it does not exist", () => {
		const nestedDir = join(tmpdir(), `nested-${Date.now()}`);
		const nested = join(nestedDir, "savings.jsonl");
		appendRecord(makeRecord(), nested);
		expect(() => readFileSync(nested, "utf8")).not.toThrow();
		rmSync(nestedDir, { recursive: true });
	});
});

describe("AC5 — warn-once on write error", () => {
	it("writes one stderr message on first error, silences subsequent errors", () => {
		const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		const badPath = "/no-permission/savings.jsonl";
		appendRecord(makeRecord(), badPath);
		appendRecord(makeRecord(), badPath);
		expect(stderrSpy).toHaveBeenCalledOnce();
		stderrSpy.mockRestore();
	});
});

describe("AC6 — readRecords returns records in file order, skips malformed lines", () => {
	it("returns all valid records in insertion order", () => {
		const r1 = makeRecord({ command: "git status" });
		const r2 = makeRecord({ command: "git diff" });
		appendRecord(r1, tmpLog);
		appendRecord(r2, tmpLog);
		const records = readRecords(tmpLog);
		expect(records).toHaveLength(2);
		expect(records[0]?.command).toBe("git status");
		expect(records[1]?.command).toBe("git diff");
	});

	it("skips malformed lines without throwing", () => {
		appendFileSync(tmpLog, "not-json\n");
		appendRecord(makeRecord(), tmpLog);
		appendFileSync(tmpLog, "{broken\n");
		const records = readRecords(tmpLog);
		expect(records).toHaveLength(1);
	});

	it("returns empty array when file does not exist", () => {
		expect(readRecords("/nonexistent/path.jsonl")).toEqual([]);
	});
});

describe("AC4 — pruneIfNeeded trims log to 90% of cap before first append", () => {
	it("no-ops when file does not exist", () => {
		expect(() => pruneIfNeeded(10, "/nonexistent/path.jsonl")).not.toThrow();
	});

	it("no-ops when record count < cap", () => {
		appendRecord(makeRecord(), tmpLog);
		appendRecord(makeRecord(), tmpLog);
		pruneIfNeeded(10, tmpLog);
		expect(readRecords(tmpLog)).toHaveLength(2);
	});

	it("prunes to floor(cap * 0.9) lines when count >= cap", () => {
		const cap = 10;
		for (let i = 0; i < cap; i++) {
			appendRecord(makeRecord({ command: `cmd-${i}` }), tmpLog);
		}
		pruneIfNeeded(cap, tmpLog);
		const after = readRecords(tmpLog);
		expect(after).toHaveLength(Math.floor(cap * 0.9)); // 9
		expect(after[after.length - 1]?.command).toBe("cmd-9");
	});
});
