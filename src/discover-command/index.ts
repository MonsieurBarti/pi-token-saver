import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { TOKEN_SAVER_UNMATCHED_EVENT, type UnmatchedEvent } from "../pi-hook.js";
import {
	DEFAULT_UNMATCHED_CAP,
	DEFAULT_UNMATCHED_LOG_PATH,
	appendUnmatched,
	pruneUnmatchedIfNeeded,
	readUnmatched,
} from "./storage.js";

interface EventLike {
	on(channel: string, handler: (data: unknown) => void): unknown;
}

export class DiscoverTracker {
	private pruned = false;
	private readonly projectCwd: string;

	constructor(
		events: EventLike,
		private readonly sessionId: number,
		private readonly options: { cap?: number; logPath?: string } = {},
	) {
		this.projectCwd = process.cwd();
		events.on(TOKEN_SAVER_UNMATCHED_EVENT, (data: unknown) => {
			const event = data as UnmatchedEvent;
			const cap = this.options.cap ?? DEFAULT_UNMATCHED_CAP;
			const logPath = this.options.logPath ?? DEFAULT_UNMATCHED_LOG_PATH;
			if (!this.pruned) {
				this.pruned = true;
				pruneUnmatchedIfNeeded(cap, logPath);
			}
			const parts = event.command.trim().split(/\s+/);
			const commandKey = parts.slice(0, 2).join(" ");
			appendUnmatched(
				{
					sessionId: this.sessionId,
					timestamp: event.timestamp,
					command: event.command,
					commandKey,
					projectCwd: this.projectCwd,
					byteCount: event.byteCount,
				},
				logPath,
			);
		});
	}
}

export function registerDiscoverCommand(
	api: ExtensionAPI,
	_sessionId: number,
	options: { logPath?: string } = {},
): void {
	const logPath = options.logPath ?? DEFAULT_UNMATCHED_LOG_PATH;

	api.registerCommand("token-saver:discover", {
		description: "Show commands that could benefit from filtering",
		handler: async (_args, _ctx) => {
			const records = readUnmatched(logPath);

			if (records.length === 0) {
				api.sendMessage(
					{
						customType: "token-saver:discover",
						content: "No unmatched commands recorded yet.",
						display: true,
					},
					{ triggerTurn: false },
				);
				return;
			}

			const grouped = new Map<string, { count: number; totalBytes: number }>();
			for (const r of records) {
				const entry = grouped.get(r.commandKey) ?? { count: 0, totalBytes: 0 };
				entry.count += 1;
				entry.totalBytes += r.byteCount;
				grouped.set(r.commandKey, entry);
			}

			const sorted = [...grouped.entries()].sort((a, b) => {
				const avgA = a[1].totalBytes / a[1].count;
				const avgB = b[1].totalBytes / b[1].count;
				return avgB - avgA;
			});

			const fmt = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

			const rows = sorted
				.map(([key, { count, totalBytes }]) => {
					const avg = totalBytes / count;
					return `| ${key} | ${count} | ${fmt(avg)} | ${fmt(totalBytes)} |`;
				})
				.join("\n");

			const report = [
				"## Token Saver — Discovery Report",
				"",
				"Commands seen without a filter rule, ranked by avg output size:",
				"",
				"| Command | Seen | Avg output | Total output |",
				"|---|---|---|---|",
				rows,
			].join("\n");

			api.sendMessage(
				{ customType: "token-saver:discover", content: report, display: true },
				{ triggerTurn: false },
			);
		},
	});
}
