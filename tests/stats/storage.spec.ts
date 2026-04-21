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
