import { EventEmitter } from "node:events";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FilterRecord, TOKEN_SAVER_FILTERED_EVENT } from "../../src/pi-hook.js";
import { StatsTracker } from "../../src/stats/index.js";
import { _resetWarnedForTest, readStats } from "../../src/stats/storage.js";

let tmpPath: string;

const makeRecord = (overrides: Partial<FilterRecord> = {}): FilterRecord => ({
	ruleName: "rule-x",
	command: "echo hi",
	bytesBefore: 500,
	bytesAfter: 100,
	timestamp: Date.now(),
	...overrides,
});

beforeEach(() => {
	tmpPath = join(tmpdir(), `stats-tracker-${Date.now()}-${Math.random()}.json`);
	_resetWarnedForTest();
});

afterEach(() => {
	try {
		rmSync(tmpPath);
	} catch {
		/* ok */
	}
});

describe("StatsTracker", () => {
	it("records on filtered event and persists", () => {
		const events = new EventEmitter();
		new StatsTracker(events, { statsPath: tmpPath });
		events.emit(TOKEN_SAVER_FILTERED_EVENT, makeRecord());
		const state = readStats(tmpPath);
		expect(state.rules["rule-x"]?.fired).toBe(1);
		expect(state.rules["rule-x"]?.bytesIn).toBe(500);
		expect(state.rules["rule-x"]?.bytesOut).toBe(100);
	});

	it("accumulates across events in the same session", () => {
		const events = new EventEmitter();
		new StatsTracker(events, { statsPath: tmpPath });
		events.emit(TOKEN_SAVER_FILTERED_EVENT, makeRecord({ bytesBefore: 200, bytesAfter: 50 }));
		events.emit(TOKEN_SAVER_FILTERED_EVENT, makeRecord({ bytesBefore: 100, bytesAfter: 30 }));
		const state = readStats(tmpPath);
		expect(state.rules["rule-x"]?.fired).toBe(2);
		expect(state.rules["rule-x"]?.bytesIn).toBe(300);
		expect(state.rules["rule-x"]?.bytesOut).toBe(80);
	});

	it("merges across simulated restarts", () => {
		const events1 = new EventEmitter();
		new StatsTracker(events1, { statsPath: tmpPath });
		events1.emit(TOKEN_SAVER_FILTERED_EVENT, makeRecord());

		const events2 = new EventEmitter();
		new StatsTracker(events2, { statsPath: tmpPath });
		events2.emit(TOKEN_SAVER_FILTERED_EVENT, makeRecord());

		expect(readStats(tmpPath).rules["rule-x"]?.fired).toBe(2);
	});
});
