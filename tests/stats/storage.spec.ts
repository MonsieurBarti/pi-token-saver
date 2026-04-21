import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetWarnedForTest, readStats } from "../../src/stats/storage.js";

let tmpPath: string;

beforeEach(() => {
	tmpPath = join(tmpdir(), `stats-test-${Date.now()}-${Math.random()}.json`);
	_resetWarnedForTest();
});

afterEach(() => {
	try {
		rmSync(tmpPath);
	} catch {
		/* ok */
	}
});

describe("readStats", () => {
	it("returns empty state when file missing", () => {
		expect(readStats(tmpPath)).toEqual({ rules: {} });
	});

	it("returns parsed state when file valid", () => {
		mkdirSync(dirname(tmpPath), { recursive: true });
		writeFileSync(
			tmpPath,
			JSON.stringify({
				rules: {
					r1: {
						fired: 3,
						bytesIn: 100,
						bytesOut: 30,
						matchNoReduction: 0,
						firstSeen: "2026-01-01T00:00:00.000Z",
						lastSeen: "2026-01-02T00:00:00.000Z",
					},
				},
			}),
		);
		expect(readStats(tmpPath).rules.r1?.fired).toBe(3);
	});

	it("returns empty state + warns once on malformed json", () => {
		mkdirSync(dirname(tmpPath), { recursive: true });
		writeFileSync(tmpPath, "{not-json");
		const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		expect(readStats(tmpPath)).toEqual({ rules: {} });
		expect(spy).toHaveBeenCalledOnce();
		spy.mockRestore();
	});
});

import { type StatsState, mergeRecord } from "../../src/stats/storage.js";

describe("mergeRecord", () => {
	it("initializes rule on first record", () => {
		const next = mergeRecord({ rules: {} }, "rule-a", 500, 100, "2026-04-21T00:00:00.000Z");
		expect(next.rules["rule-a"]).toEqual({
			fired: 1,
			bytesIn: 500,
			bytesOut: 100,
			matchNoReduction: 0,
			firstSeen: "2026-04-21T00:00:00.000Z",
			lastSeen: "2026-04-21T00:00:00.000Z",
		});
	});

	it("accumulates and preserves firstSeen on subsequent records", () => {
		let state: StatsState = { rules: {} };
		state = mergeRecord(state, "rule-a", 500, 100, "2026-04-21T00:00:00.000Z");
		state = mergeRecord(state, "rule-a", 300, 50, "2026-04-22T00:00:00.000Z");
		expect(state.rules["rule-a"]).toEqual({
			fired: 2,
			bytesIn: 800,
			bytesOut: 150,
			matchNoReduction: 0,
			firstSeen: "2026-04-21T00:00:00.000Z",
			lastSeen: "2026-04-22T00:00:00.000Z",
		});
	});

	it("increments matchNoReduction when bytesOut >= bytesIn (boundary + strict)", () => {
		let state: StatsState = { rules: {} };
		state = mergeRecord(state, "r", 100, 100, "2026-01-01T00:00:00.000Z");
		state = mergeRecord(state, "r", 50, 80, "2026-01-02T00:00:00.000Z");
		expect(state.rules.r?.matchNoReduction).toBe(2);
		expect(state.rules.r?.fired).toBe(2);
	});
});
