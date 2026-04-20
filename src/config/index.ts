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

// Heuristic to detect obviously catastrophic nested-quantifier patterns.
// Covers cases like `(a+)+`, `(a*)+`, `[a-z]+*`.
// This is intentionally a heuristic, not a proof — for a CLI tool with
// per-user config (not a web-facing attack surface) it provides good
// protection against accidental or naive ReDoS patterns without needing
// a full regex complexity analyser or a new runtime dependency.
const NESTED_QUANTIFIER_RE =
	/(\([^)]*[+*]\s*(?:\{\d+,?\d*\})?\)\s*[+*](?:\{\d+,?\d*\})?)|(\[[^\]]*\]\s*[+*]\s*[+*])/;

/**
 * Compiles a user-supplied regex source string to a RegExp safely.
 * Returns null (and emits a console.warn) if:
 *   - source exceeds 256 chars (length cap)
 *   - source matches the nested-quantifier heuristic (ReDoS mitigation)
 *   - source is syntactically invalid
 */
function compileSafeRegex(
	source: string,
	context: { rule: string; field: string; filePath: string },
): RegExp | null {
	const { rule, field, filePath } = context;

	if (source.length > 256) {
		console.warn(
			`[token-saver] Skipping rule "${rule}" — ${field} regex exceeds 256 chars in ${filePath}`,
		);
		return null;
	}

	if (NESTED_QUANTIFIER_RE.test(source)) {
		console.warn(
			`[token-saver] Skipping rule "${rule}" — ${field} regex has potentially catastrophic backtracking pattern in ${filePath}`,
		);
		return null;
	}

	try {
		return new RegExp(source);
	} catch {
		console.warn(
			`[token-saver] Skipping rule "${rule}" — invalid ${field} regex "${source}" in ${filePath}`,
		);
		return null;
	}
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
		const matchCommand = compileSafeRegex(rule.matchCommand, {
			rule: rule.name,
			field: "matchCommand",
			filePath,
		});
		if (matchCommand === null) continue;

		const rawPipeline = rule.pipeline;

		// Compile stripLinesMatching — skip rule if any entry is invalid
		let stripLinesMatching: RegExp[] | undefined;
		if (rawPipeline.stripLinesMatching !== undefined) {
			const compiled: RegExp[] = [];
			let valid = true;
			for (const src of rawPipeline.stripLinesMatching) {
				const re = compileSafeRegex(src, {
					rule: rule.name,
					field: "pipeline.stripLinesMatching",
					filePath,
				});
				if (re === null) {
					valid = false;
					break;
				}
				compiled.push(re);
			}
			if (!valid) continue;
			stripLinesMatching = compiled;
		}

		// Compile keepLinesMatching — skip rule if any entry is invalid
		let keepLinesMatching: RegExp[] | undefined;
		if (rawPipeline.keepLinesMatching !== undefined) {
			const compiled: RegExp[] = [];
			let valid = true;
			for (const src of rawPipeline.keepLinesMatching) {
				const re = compileSafeRegex(src, {
					rule: rule.name,
					field: "pipeline.keepLinesMatching",
					filePath,
				});
				if (re === null) {
					valid = false;
					break;
				}
				compiled.push(re);
			}
			if (!valid) continue;
			keepLinesMatching = compiled;
		}

		// Compile replace entries — skip rule if any pattern is invalid
		let replace: FilterPipeline["replace"];
		if (rawPipeline.replace !== undefined) {
			const compiled: Array<{ pattern: RegExp; replacement: string }> = [];
			let valid = true;
			for (const entry of rawPipeline.replace) {
				const re = compileSafeRegex(entry.pattern, {
					rule: rule.name,
					field: "pipeline.replace[].pattern",
					filePath,
				});
				if (re === null) {
					valid = false;
					break;
				}
				compiled.push({ pattern: re, replacement: entry.replacement });
			}
			if (!valid) continue;
			replace = compiled;
		}

		// Compile matchOutput entries — skip rule if any pattern/unless is invalid
		let matchOutput: FilterPipeline["matchOutput"];
		if (rawPipeline.matchOutput !== undefined) {
			const compiled: Array<{ pattern: RegExp; message: string; unless?: RegExp }> = [];
			let valid = true;
			for (const entry of rawPipeline.matchOutput) {
				const patternRe = compileSafeRegex(entry.pattern, {
					rule: rule.name,
					field: "pipeline.matchOutput[].pattern",
					filePath,
				});
				if (patternRe === null) {
					valid = false;
					break;
				}
				let unlessRe: RegExp | undefined;
				if (entry.unless !== undefined) {
					const r = compileSafeRegex(entry.unless, {
						rule: rule.name,
						field: "pipeline.matchOutput[].unless",
						filePath,
					});
					if (r === null) {
						valid = false;
						break;
					}
					unlessRe = r;
				}
				const outEntry: { pattern: RegExp; message: string; unless?: RegExp } = {
					pattern: patternRe,
					message: entry.message,
				};
				if (unlessRe !== undefined) outEntry.unless = unlessRe;
				compiled.push(outEntry);
			}
			if (!valid) continue;
			matchOutput = compiled;
		}

		// Construct pipeline explicitly from scalar fields (already type-checked by TypeBox)
		// and the compiled regex fields above. Never cast the raw object to FilterPipeline.
		const pipeline: FilterPipeline = {};
		if (typeof rawPipeline.stripAnsi === "boolean") pipeline.stripAnsi = rawPipeline.stripAnsi;
		if (replace !== undefined) pipeline.replace = replace;
		if (matchOutput !== undefined) pipeline.matchOutput = matchOutput;
		if (stripLinesMatching !== undefined) pipeline.stripLinesMatching = stripLinesMatching;
		if (keepLinesMatching !== undefined) pipeline.keepLinesMatching = keepLinesMatching;
		if (typeof rawPipeline.truncateLinesAt === "number")
			pipeline.truncateLinesAt = rawPipeline.truncateLinesAt;
		if (typeof rawPipeline.headLines === "number") pipeline.headLines = rawPipeline.headLines;
		if (typeof rawPipeline.tailLines === "number") pipeline.tailLines = rawPipeline.tailLines;
		if (typeof rawPipeline.maxLines === "number") pipeline.maxLines = rawPipeline.maxLines;
		if (typeof rawPipeline.onEmpty === "string") pipeline.onEmpty = rawPipeline.onEmpty;

		rules.push({ name: rule.name, matchCommand, pipeline });
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
