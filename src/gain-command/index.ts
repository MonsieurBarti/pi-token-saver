import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DEFAULT_LOG_PATH, readRecords } from "../savings-tracker/storage.js";

interface GainCommandOptions {
	logPath?: string;
}

export function registerGainCommand(
	api: ExtensionAPI,
	sessionId: number,
	options: GainCommandOptions = {},
): void {
	const logPath = options.logPath ?? DEFAULT_LOG_PATH;

	api.registerCommand("token-saver:gain", {
		description: "Show token savings report",
		handler: async (_args, _ctx) => {
			const records = readRecords(logPath);

			if (records.length === 0) {
				api.sendMessage(
					{ customType: "token-saver:gain", content: "No savings recorded yet.", display: true },
					{ triggerTurn: false },
				);
				return;
			}

			const sessionRecords = records.filter((r) => r.sessionId === sessionId);
			const sessionBytes = sessionRecords.reduce(
				(sum, r) => sum + (r.bytesBefore - r.bytesAfter),
				0,
			);
			const sessionTokens = Math.round(sessionBytes / 4);

			const byCommand = new Map<string, number>();
			for (const r of sessionRecords) {
				byCommand.set(
					r.commandName,
					(byCommand.get(r.commandName) ?? 0) + (r.bytesBefore - r.bytesAfter),
				);
			}
			const sorted = [...byCommand.entries()].sort(
				(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
			);

			const histBytes = records.reduce((sum, r) => sum + (r.bytesBefore - r.bytesAfter), 0);
			const histTokens = Math.round(histBytes / 4);

			const fmt = new Intl.NumberFormat("en-US").format;

			const perCmdRows = sorted
				.map(([cmd, bytes]) => `| ${cmd} | ${fmt(bytes)} B | ~${Math.round(bytes / 4)} |`)
				.join("\n");

			const report = [
				"## Token Saver — Savings Report",
				"",
				"### This Session",
				"| Metric | Value |",
				"|---|---|",
				`| Bytes saved | ${fmt(sessionBytes)} B |`,
				`| Est. tokens saved | ~${sessionTokens} |`,
				"",
				"### Per-Command Breakdown (this session)",
				"| Command | Bytes saved | Est. tokens |",
				"|---|---|---|",
				perCmdRows,
				"",
				"### Historical (all sessions)",
				"| Metric | Value |",
				"|---|---|",
				`| Bytes saved | ${fmt(histBytes)} B |`,
				`| Est. tokens saved | ~${histTokens} |`,
			].join("\n");

			api.sendMessage(
				{ customType: "token-saver:gain", content: report, display: true },
				{ triggerTurn: false },
			);
		},
	});
}
