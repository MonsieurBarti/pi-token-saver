import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DEFAULT_STATS_PATH, readStats } from "../stats/storage.js";

interface StatsCommandOptions {
	statsPath?: string;
}

export function registerStatsCommand(api: ExtensionAPI, options: StatsCommandOptions = {}): void {
	const statsPath = options.statsPath ?? DEFAULT_STATS_PATH;

	api.registerCommand("token-saver:stats", {
		description: "Show per-rule filter stats",
		handler: async (_args, _ctx) => {
			const state = readStats(statsPath);
			const ruleNames = Object.keys(state.rules);
			if (ruleNames.length === 0) {
				api.sendMessage(
					{ customType: "token-saver:stats", content: "No stats recorded yet.", display: true },
					{ triggerTurn: false },
				);
				return;
			}
			// Populated-stats path filled in by T02.
			api.sendMessage(
				{ customType: "token-saver:stats", content: "No stats recorded yet.", display: true },
				{ triggerTurn: false },
			);
		},
	});
}
