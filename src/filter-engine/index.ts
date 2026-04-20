export interface FilterRule {
	name: string;
	matchCommand: RegExp;
	imageOnlyFallback?: string;
	pipeline: FilterPipeline;
}

export interface FilterPipeline {
	stripAnsi?: boolean;
	replace?: Array<{ pattern: RegExp; replacement: string }>;
	matchOutput?: Array<{ pattern: RegExp; message: string; unless?: RegExp }>;
	stripLinesMatching?: RegExp[];
	keepLinesMatching?: RegExp[];
	truncateLinesAt?: number;
	headLines?: number;
	tailLines?: number;
	maxLines?: number;
	onEmpty?: string;
}

export type FilterResult =
	| { matched: true; output: string; bytesBefore: number; bytesAfter: number }
	| { matched: false; output: string; bytesBefore: number; bytesAfter: number };

export const OMITTED_LINES_MARKER = (count: number) => `… ${count} lines omitted …`;
export const TRUNCATED_LINES_MARKER = (count: number) => `… ${count} lines truncated`;

// Standard strip-ansi pattern covering CSI, OSC (BEL-terminated), and C1 sequences.
const ANSI_RE =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI pattern requires ESC (0x1b), CSI (0x9b), BEL (0x07)
	/[\x1b\x9b][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\x07)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export class FilterRegistry {
	private readonly rules: FilterRule[];

	constructor(rules: FilterRule[]) {
		for (const rule of rules) {
			if (rule.pipeline.stripLinesMatching && rule.pipeline.keepLinesMatching) {
				throw new Error(
					`Rule "${rule.name}" has both stripLinesMatching and keepLinesMatching — mutually exclusive`,
				);
			}
		}
		this.rules = rules;
	}

	find(command: string): FilterRule | undefined {
		return this.rules.find((r) => r.matchCommand.test(command));
	}
}

export class FilterEngine {
	constructor(private readonly registry: FilterRegistry) {}

	process(command: string, content: string): FilterResult {
		const bytesBefore = Buffer.byteLength(content, "utf8");
		const rule = this.registry.find(command);

		if (!rule) {
			return { matched: false, output: content, bytesBefore, bytesAfter: bytesBefore };
		}

		const { pipeline } = rule;

		// Normalize line endings: \r\n and bare \r → \n, then split
		let lines = content.replace(/\r\n|\r/g, "\n").split("\n");

		// Stage 1: stripAnsi
		if (pipeline.stripAnsi) {
			lines = lines.map((line) => line.replace(ANSI_RE, ""));
		}

		// Stage 2: replace — entry N+1 sees output of entry N across all lines
		if (pipeline.replace) {
			for (const { pattern, replacement } of pipeline.replace) {
				lines = lines.map((line) => line.replace(pattern, replacement));
			}
		}

		// Stage 3: matchOutput — first matching entry (unless check) → return immediately; [4]-[8] skipped
		if (pipeline.matchOutput) {
			const blob = lines.join("\n");
			for (const entry of pipeline.matchOutput) {
				if (entry.pattern.test(blob)) {
					if (!entry.unless || !entry.unless.test(blob)) {
						const output = entry.message;
						return {
							matched: true,
							output,
							bytesBefore,
							bytesAfter: Buffer.byteLength(output, "utf8"),
						};
					}
				}
			}
		}

		// Stage 4: strip/keep (mutually exclusive — enforced at FilterRegistry construction)
		if (pipeline.stripLinesMatching) {
			const patterns = pipeline.stripLinesMatching;
			lines = lines.filter((line) => !patterns.some((p) => p.test(line)));
		} else if (pipeline.keepLinesMatching) {
			const patterns = pipeline.keepLinesMatching;
			lines = lines.filter((line) => patterns.some((p) => p.test(line)));
		}

		// Stage 5: truncateLinesAt — measured in Unicode code points
		if (pipeline.truncateLinesAt !== undefined) {
			const limit = pipeline.truncateLinesAt;
			lines = lines.map((line) => {
				const codePoints = [...line];
				return codePoints.length > limit ? `${codePoints.slice(0, limit).join("")}…` : line;
			});
		}

		// Stage 6: head/tail — no marker when headLines + tailLines >= totalLines
		if (pipeline.headLines !== undefined || pipeline.tailLines !== undefined) {
			const head = pipeline.headLines ?? 0;
			const tail = pipeline.tailLines ?? 0;
			const total = lines.length;
			if (head + tail < total) {
				const headPart = lines.slice(0, head);
				const tailPart = tail > 0 ? lines.slice(total - tail) : [];
				lines = [...headPart, OMITTED_LINES_MARKER(total - head - tail), ...tailPart];
			}
		}

		// Stage 7: maxLines — hard cap; [6] wins if already within limit
		if (pipeline.maxLines !== undefined && lines.length > pipeline.maxLines) {
			const excess = lines.length - pipeline.maxLines;
			lines = lines.slice(0, pipeline.maxLines);
			lines.push(TRUNCATED_LINES_MARKER(excess));
		}

		// Stage 8: onEmpty
		if (pipeline.onEmpty !== undefined && lines.join("").length === 0) {
			const output = pipeline.onEmpty;
			return { matched: true, output, bytesBefore, bytesAfter: Buffer.byteLength(output, "utf8") };
		}

		const output = lines.join("\n");
		return { matched: true, output, bytesBefore, bytesAfter: Buffer.byteLength(output, "utf8") };
	}
}
