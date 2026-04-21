import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface RuleStats {
	fired: number;
	bytesIn: number;
	bytesOut: number;
	matchNoReduction: number;
	firstSeen: string;
	lastSeen: string;
}

export interface StatsState {
	rules: Record<string, RuleStats>;
}

export const DEFAULT_STATS_PATH = join(homedir(), ".pi", "token-saver", "stats.json");

let warned = false;

export function _resetWarnedForTest(): void {
	warned = false;
}

function warnOnce(msg: string): void {
	if (warned) return;
	warned = true;
	process.stderr.write(`[token-saver] ${msg}\n`);
}

export function readStats(statsPath: string = DEFAULT_STATS_PATH): StatsState {
	let content: string;
	try {
		content = readFileSync(statsPath, "utf8");
	} catch {
		return { rules: {} };
	}
	try {
		const parsed = JSON.parse(content) as StatsState;
		if (typeof parsed !== "object" || parsed === null || typeof parsed.rules !== "object") {
			warnOnce("stats.json malformed — resetting");
			return { rules: {} };
		}
		return parsed;
	} catch {
		warnOnce("stats.json malformed — resetting");
		return { rules: {} };
	}
}

export function mergeRecord(
	state: StatsState,
	ruleName: string,
	bytesIn: number,
	bytesOut: number,
	timestamp: string,
): StatsState {
	const prev = state.rules[ruleName];
	const noReduction = bytesOut >= bytesIn ? 1 : 0;
	const next: RuleStats = prev
		? {
				fired: prev.fired + 1,
				bytesIn: prev.bytesIn + bytesIn,
				bytesOut: prev.bytesOut + bytesOut,
				matchNoReduction: prev.matchNoReduction + noReduction,
				firstSeen: prev.firstSeen,
				lastSeen: timestamp,
			}
		: {
				fired: 1,
				bytesIn,
				bytesOut,
				matchNoReduction: noReduction,
				firstSeen: timestamp,
				lastSeen: timestamp,
			};
	return { rules: { ...state.rules, [ruleName]: next } };
}
