import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface UnmatchedRecord {
	sessionId: number;
	timestamp: number;
	commandKey: string;
	projectCwd: string;
	byteCount: number;
}

export const DEFAULT_UNMATCHED_CAP = 10_000;
export const DEFAULT_UNMATCHED_LOG_PATH = join(homedir(), ".pi", "token-saver", "unmatched.jsonl");

let warned = false;

export function _resetUnmatchedWarnedForTest(): void {
	warned = false;
}

export function appendUnmatched(
	record: UnmatchedRecord,
	logPath: string = DEFAULT_UNMATCHED_LOG_PATH,
): void {
	try {
		mkdirSync(dirname(logPath), { recursive: true });
		appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
	} catch (err) {
		if (!warned) {
			warned = true;
			process.stderr.write(`[token-saver] unmatched write failed: ${String(err)}\n`);
		}
	}
}

export function readUnmatched(logPath: string = DEFAULT_UNMATCHED_LOG_PATH): UnmatchedRecord[] {
	let content: string;
	try {
		content = readFileSync(logPath, "utf8");
	} catch {
		return [];
	}
	return content
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as UnmatchedRecord];
			} catch {
				return [];
			}
		});
}

export function pruneUnmatchedIfNeeded(
	cap: number,
	logPath: string = DEFAULT_UNMATCHED_LOG_PATH,
): void {
	let content: string;
	try {
		content = readFileSync(logPath, "utf8");
	} catch {
		return;
	}
	const lines = content.split("\n").filter((line) => line.trim().length > 0);
	if (lines.length < cap) return;
	const keep = Math.floor(cap * 0.9);
	const kept = lines.slice(lines.length - keep);
	try {
		writeFileSync(logPath, `${kept.join("\n")}\n`, "utf8");
	} catch (err) {
		if (!warned) {
			warned = true;
			process.stderr.write(`[token-saver] unmatched prune failed: ${String(err)}\n`);
		}
	}
}
