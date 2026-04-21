import { type FilterRecord, TOKEN_SAVER_FILTERED_EVENT } from "../pi-hook.js";
import { DEFAULT_STATS_PATH, mergeRecord, readStats, writeStats } from "./storage.js";

interface EventLike {
	on(channel: string, handler: (data: unknown) => void): unknown;
}

export { readStats } from "./storage.js";
export type { RuleStats, StatsState } from "./storage.js";

export class StatsTracker {
	constructor(
		events: EventLike,
		private readonly options: { statsPath?: string } = {},
	) {
		events.on(TOKEN_SAVER_FILTERED_EVENT, (data: unknown) => {
			const record = data as FilterRecord;
			const path = this.options.statsPath ?? DEFAULT_STATS_PATH;
			const state = readStats(path);
			const ts = new Date(record.timestamp).toISOString();
			const next = mergeRecord(state, record.ruleName, record.bytesBefore, record.bytesAfter, ts);
			writeStats(next, path);
		});
	}
}
