import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface SavingsRecord {
	sessionId: number;
	timestamp: number;
	command: string;
	commandName: string;
	projectCwd: string;
	bytesBefore: number;
	bytesAfter: number;
}

export const DEFAULT_CAP = 10_000;
export const DEFAULT_LOG_PATH = join(homedir(), ".pi", "token-saver", "savings.jsonl");

let warned = false;

export function _resetWarnedForTest(): void {
	warned = false;
}

export function appendRecord(record: SavingsRecord, logPath: string = DEFAULT_LOG_PATH): void {
	try {
		mkdirSync(dirname(logPath), { recursive: true });
		appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
	} catch (err) {
		if (!warned) {
			warned = true;
			process.stderr.write(`[token-saver] savings write failed: ${String(err)}\n`);
		}
	}
}

export function readRecords(logPath: string = DEFAULT_LOG_PATH): SavingsRecord[] {
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
				return [JSON.parse(line) as SavingsRecord];
			} catch {
				return [];
			}
		});
}
