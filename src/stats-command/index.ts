import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DEFAULT_STATS_PATH, type RuleStats, readStats } from "../stats/storage.js";

interface StatsCommandOptions {
	statsPath?: string;
}

interface Row {
	name: string;
	fired: number;
	bytesSaved: number;
	noReduction: number;
	reductionPct: number | null;
}

const NUMBER_FMT = new Intl.NumberFormat("en-US");

function toRow(name: string, r: RuleStats): Row {
	const bytesSaved = r.bytesIn - r.bytesOut;
	const reductionPct = r.bytesIn === 0 ? null : Math.round((bytesSaved / r.bytesIn) * 100);
	return { name, fired: r.fired, bytesSaved, noReduction: r.matchNoReduction, reductionPct };
}

function sortRows(rows: Row[]): Row[] {
	return [...rows].sort((a, b) => b.bytesSaved - a.bytesSaved || a.name.localeCompare(b.name));
}

function renderTable(rows: Row[]): string {
	const header = "| Rule | Fired | Bytes saved | No-reduction | Reduction % |";
	const divider = "|---|---|---|---|---|";
	const body = rows
		.map((row) => {
			const pct = row.reductionPct === null ? "—" : `${row.reductionPct}%`;
			return `| ${row.name} | ${row.fired} | ${NUMBER_FMT.format(row.bytesSaved)} B | ${row.noReduction} | ${pct} |`;
		})
		.join("\n");
	return [header, divider, body].join("\n");
}

export function registerStatsCommand(api: ExtensionAPI, options: StatsCommandOptions = {}): void {
	const statsPath = options.statsPath ?? DEFAULT_STATS_PATH;

	api.registerCommand("token-saver:stats", {
		description: "Show per-rule filter stats",
		handler: async (_args, _ctx) => {
			const state = readStats(statsPath);
			const entries = Object.entries(state.rules);
			if (entries.length === 0) {
				api.sendMessage(
					{ customType: "token-saver:stats", content: "No stats recorded yet.", display: true },
					{ triggerTurn: false },
				);
				return;
			}

			const rows = sortRows(entries.map(([name, stats]) => toRow(name, stats)));
			const report = ["## Token Saver — Per-Rule Stats", "", renderTable(rows)].join("\n");

			api.sendMessage(
				{ customType: "token-saver:stats", content: report, display: true },
				{ triggerTurn: false },
			);
		},
	});
}
