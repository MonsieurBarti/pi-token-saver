import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Value } from "@sinclair/typebox/value";
import type { FilterPipeline, FilterRule } from "../filter-engine/index.js";
import { type RawConfig, RawConfigSchema } from "./schema.js";

export interface ResolvedConfig {
	disabled: string[];
	rules: FilterRule[];
}

function parseFile(filePath: string): RawConfig | null {
	let text: string;
	try {
		text = fs.readFileSync(filePath, "utf8");
	} catch {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		console.warn(`[token-saver] Skipping invalid JSON in ${filePath}`);
		return null;
	}
	if (!Value.Check(RawConfigSchema, parsed)) {
		console.warn(`[token-saver] Skipping invalid config in ${filePath}`);
		return null;
	}
	return parsed as RawConfig;
}

function coerceRules(raw: RawConfig, filePath: string): FilterRule[] {
	const rules: FilterRule[] = [];
	for (const rule of raw.rules ?? []) {
		let matchCommand: RegExp;
		try {
			matchCommand = new RegExp(rule.matchCommand);
		} catch {
			console.warn(
				`[token-saver] Skipping rule "${rule.name}" — invalid regex "${rule.matchCommand}" in ${filePath}`,
			);
			continue;
		}
		rules.push({
			name: rule.name,
			matchCommand,
			pipeline: rule.pipeline as FilterPipeline,
		});
	}
	return rules;
}

export function loadConfig(projectRoot: string): ResolvedConfig {
	const globalPath = path.join(os.homedir(), ".pi", "token-saver", "settings.json");
	const projectPath = path.join(projectRoot, ".pi", "token-saver", "settings.json");

	const globalRaw = parseFile(globalPath);
	const projectRaw = parseFile(projectPath);

	const disabled = [...new Set([...(globalRaw?.disabled ?? []), ...(projectRaw?.disabled ?? [])])];

	const rules = [
		...(globalRaw ? coerceRules(globalRaw, globalPath) : []),
		...(projectRaw ? coerceRules(projectRaw, projectPath) : []),
	];

	return { disabled, rules };
}
