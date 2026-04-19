import { type FilterRecord, TOKEN_SAVER_FILTERED_EVENT } from "../pi-hook.js";
import { DEFAULT_CAP, DEFAULT_LOG_PATH, appendRecord, pruneIfNeeded } from "./storage.js";

/** Minimal event emitter interface compatible with both Node EventEmitter and EventBus. */
interface EventLike {
	on(channel: string, handler: (data: unknown) => void): unknown;
}

export type { SavingsRecord } from "./storage.js";
export { readRecords } from "./storage.js";

export class SavingsTracker {
	private pruned = false;
	private readonly projectCwd: string;

	constructor(
		events: EventLike,
		private readonly sessionId: number,
		private readonly options: { cap?: number; logPath?: string } = {},
	) {
		this.projectCwd = process.cwd();
		events.on(TOKEN_SAVER_FILTERED_EVENT, (data: unknown) => {
			const record = data as FilterRecord;
			const cap = this.options.cap ?? DEFAULT_CAP;
			const logPath = this.options.logPath ?? DEFAULT_LOG_PATH;
			if (!this.pruned) {
				this.pruned = true;
				pruneIfNeeded(cap, logPath);
			}
			appendRecord(
				{
					sessionId: this.sessionId,
					timestamp: record.timestamp,
					command: record.command,
					commandName: record.command.trim().split(/\s+/)[0] ?? "",
					projectCwd: this.projectCwd,
					bytesBefore: record.bytesBefore,
					bytesAfter: record.bytesAfter,
				},
				logPath,
			);
		});
	}
}
