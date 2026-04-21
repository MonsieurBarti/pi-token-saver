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

interface SinceParseResult {
	since: Date | null;
	error: string | null;
}

const NUMBER_FMT = new Intl.NumberFormat("en-US");

function parseSinceFlag(args: string): SinceParseResult {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const idx = tokens.indexOf("--since");
	if (idx === -1) return { since: null, error: null };
	const value = tokens[idx + 1];
	if (!value) {
		return {
			since: null,
			error:
				"Invalid --since value. Accepted formats: YYYY-MM-DD or full ISO 8601 (e.g. 2026-04-01T00:00:00Z).",
		};
	}
	const ms = Date.parse(value);
	if (Number.isNaN(ms)) {
		return {
			since: null,
			error: `Invalid --since value "${value}". Accepted formats: YYYY-MM-DD or full ISO 8601 (e.g. 2026-04-01T00:00:00Z).`,
		};
	}
	return { since: new Date(ms), error: null };
}

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
		handler: async (args, _ctx) => {
			const parsed = parseSinceFlag(args);
			if (parsed.error) {
				api.sendMessage(
					{ customType: "token-saver:stats", content: parsed.error, display: true },
					{ triggerTurn: false },
				);
				return;
			}

			const state = readStats(statsPath);
			const entries = Object.entries(state.rules);
			if (entries.length === 0) {
				api.sendMessage(
					{ customType: "token-saver:stats", content: "No stats recorded yet.", display: true },
					{ triggerTurn: false },
				);
				return;
			}

			const filtered = parsed.since
				? entries.filter(
						([, stats]) => new Date(stats.firstSeen).getTime() >= (parsed.since as Date).getTime(),
					)
				: entries;

			if (parsed.since && filtered.length === 0) {
				api.sendMessage(
					{
						customType: "token-saver:stats",
						content: "No rules match the --since filter.",
						display: true,
					},
					{ triggerTurn: false },
				);
				return;
			}

			const rows = sortRows(filtered.map(([name, stats]) => toRow(name, stats)));
			const report = ["## Token Saver — Per-Rule Stats", "", renderTable(rows)].join("\n");
			api.sendMessage(
				{ customType: "token-saver:stats", content: report, display: true },
				{ triggerTurn: false },
			);
		},
	});
}
