import { describe, expect, it } from "vitest";
import {
	FilterEngine,
	FilterRegistry,
	OMITTED_LINES_MARKER,
	TRUNCATED_LINES_MARKER,
} from "../../src/filter-engine/index.js";

describe("AC-01 — matched:true with correct byte counts", () => {
	it("returns matched:true and correct byte counts for a matching rule", () => {
		const registry = new FilterRegistry([{ name: "t", matchCommand: /git/, pipeline: {} }]);
		const engine = new FilterEngine(registry);
		const content = "hello\nwörld"; // multibyte ö to confirm UTF-8 byte counting
		const result = engine.process("git log", content);
		expect(result.matched).toBe(true);
		expect(result.bytesBefore).toBe(Buffer.byteLength(content, "utf8"));
		expect(result.bytesAfter).toBe(Buffer.byteLength(result.output, "utf8"));
	});
});

describe("AC-02 — matched:false, output strictly equals content", () => {
	it("returns matched:false with output strictly equal to content and no normalization", () => {
		const registry = new FilterRegistry([]);
		const engine = new FilterEngine(registry);
		const content = "some\r\noutput"; // CRLF must be preserved unchanged
		const result = engine.process("git log", content);
		expect(result.matched).toBe(false);
		expect(result.output).toBe(content);
		expect(result.bytesBefore).toBe(result.bytesAfter);
		expect(result.bytesBefore).toBe(Buffer.byteLength(content, "utf8"));
	});
});

describe("AC-03 — pipeline stages execute in documented order", () => {
	it("produces a result that only correct stage ordering (1→2→4→5) can yield", () => {
		// Input: ANSI-wrapped "KEEP", a line that becomes REMOVE after replace, and a long line.
		// Correct order:
		//   [1] stripAnsi  → ["KEEP", "WILL_BECOME_REMOVE", "ABCDEFGH"]
		//   [2] replace    → ["REPL", "REMOVE", "ABCDEFGH"]   (^KEEP$ only matches clean text)
		//   [4] strip      → ["REPL", "ABCDEFGH"]
		//   [5] truncate   → ["REPL", "ABCD…"]
		// Any adjacent swap produces a different output (see spec for proof sketch).
		const registry = new FilterRegistry([
			{
				name: "t",
				matchCommand: /cmd/,
				pipeline: {
					stripAnsi: true,
					replace: [
						{ pattern: /^KEEP$/, replacement: "REPL" },
						{ pattern: /WILL_BECOME_/, replacement: "" },
					],
					stripLinesMatching: [/^REMOVE$/],
					truncateLinesAt: 4,
				},
			},
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "\x1b[31mKEEP\x1b[0m\nWILL_BECOME_REMOVE\nABCDEFGH");
		expect(result.output).toBe("REPL\nABCD…");
	});

	it("replace entries chain — entry N+1 sees output of entry N", () => {
		const registry = new FilterRegistry([
			{
				name: "t",
				matchCommand: /cmd/,
				pipeline: {
					replace: [
						{ pattern: /A/, replacement: "B" },
						{ pattern: /B/, replacement: "C" },
					],
				},
			},
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "A_LINE");
		expect(result.output).toBe("C_LINE");
	});

	it("maxLines hard cap appends TRUNCATED_LINES_MARKER", () => {
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { maxLines: 2 } },
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "L1\nL2\nL3\nL4");
		expect(result.output).toBe(`L1\nL2\n${TRUNCATED_LINES_MARKER(2)}`);
	});

	it("keepLinesMatching retains only matching lines", () => {
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { keepLinesMatching: [/KEEP/] } },
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "KEEP_ME\nDROP_ME\nKEEP_YOU");
		expect(result.output).toBe("KEEP_ME\nKEEP_YOU");
	});
});

describe("AC-04 — matchOutput short-circuit skips stages [4]–[8]", () => {
	it("word present in message survives even though stripLinesMatching would remove it", () => {
		const registry = new FilterRegistry([
			{
				name: "t",
				matchCommand: /git/,
				pipeline: {
					matchOutput: [{ pattern: /error/, message: "INTACT_WORD is present" }],
					stripLinesMatching: [/INTACT_WORD/],
				},
			},
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("git log", "some error output");
		expect(result.matched).toBe(true);
		expect(result.output).toBe("INTACT_WORD is present");
	});
});

describe("AC-05 — matchOutput unless skips entry; next entry evaluated", () => {
	it("first entry skipped when unless matches; second entry wins", () => {
		const registry = new FilterRegistry([
			{
				name: "t",
				matchCommand: /git/,
				pipeline: {
					matchOutput: [
						{ pattern: /error/, message: "first message", unless: /critical/ },
						{ pattern: /error/, message: "second message" },
					],
				},
			},
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("git log", "critical error occurred");
		expect(result.matched).toBe(true);
		expect(result.output).toBe("second message");
	});
});

describe("AC-06 — FilterRegistry rejects strip+keep on same rule", () => {
	it("throws synchronously when both stripLinesMatching and keepLinesMatching are set", () => {
		expect(() => {
			new FilterRegistry([
				{
					name: "bad",
					matchCommand: /git/,
					pipeline: {
						stripLinesMatching: [/foo/],
						keepLinesMatching: [/bar/],
					},
				},
			]);
		}).toThrow();
	});
});

describe("AC-07 — head/tail combined with OMITTED_LINES_MARKER", () => {
	it("inserts marker between head and tail when head+tail < totalLines", () => {
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { headLines: 2, tailLines: 1 } },
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "L1\nL2\nL3\nL4\nL5");
		expect(result.output).toBe(`L1\nL2\n${OMITTED_LINES_MARKER(2)}\nL5`);
	});

	it("returns all lines unchanged when head+tail >= totalLines", () => {
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { headLines: 2, tailLines: 2 } },
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "L1\nL2\nL3");
		expect(result.output).toBe("L1\nL2\nL3");
	});
});

describe("AC-08 — onEmpty", () => {
	it("returns onEmpty when all lines are stripped", () => {
		const registry = new FilterRegistry([
			{
				name: "t",
				matchCommand: /cmd/,
				pipeline: { stripLinesMatching: [/.*/], onEmpty: "nothing to show" },
			},
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "REMOVE_ME");
		expect(result.output).toBe("nothing to show");
	});

	it("returns the retained line and not onEmpty when output is non-empty", () => {
		const registry = new FilterRegistry([
			{
				name: "t",
				matchCommand: /cmd/,
				pipeline: { stripLinesMatching: [/REMOVE/], onEmpty: "nothing to show" },
			},
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "REMOVE_ME\nKEEP_ME");
		expect(result.output).toBe("KEEP_ME");
	});
});

describe("AC-09 — Unicode safety for truncateLinesAt", () => {
	it("does not split CJK characters mid-codepoint", () => {
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { truncateLinesAt: 2 } },
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "中文内容");
		expect(result.output).toBe("中文…");
	});

	it("does not split emoji mid-codepoint", () => {
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { truncateLinesAt: 2 } },
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "😀😁😂😃");
		expect(result.output).toBe("😀😁…");
	});
});

describe("AC-10 — CRLF normalization", () => {
	it("CRLF input produces the same filtered output as LF input", () => {
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { stripLinesMatching: [/REMOVE/] } },
		]);
		const engine = new FilterEngine(registry);
		const crlfResult = engine.process("cmd", "a\r\nb\r\nREMOVE\r\nc");
		const lfResult = engine.process("cmd", "a\nb\nREMOVE\nc");
		expect(crlfResult.output).toBe(lfResult.output);
		expect(crlfResult.output).toBe("a\nb\nc");
	});
});

describe("Edge cases — onEmpty, stage 6/7 boundaries, replace semantics", () => {
	it("empty string input triggers onEmpty (spec: lines.join('').length === 0)", () => {
		// Stage 0 normalises "" to [""]; [""].join("") === "" → onEmpty fires per spec.
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { onEmpty: "fallback" } },
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "");
		expect(result.output).toBe("fallback");
	});

	it("whitespace-only line does NOT trigger onEmpty (lines.join('') is non-empty)", () => {
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { onEmpty: "fallback" } },
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "   ");
		expect(result.output).toBe("   ");
	});

	it("headLines:0 tailLines:0 with content collapses entire output to marker", () => {
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { headLines: 0, tailLines: 0 } },
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "L1\nL2\nL3");
		expect(result.output).toBe(OMITTED_LINES_MARKER(3));
	});

	it("replace is per-line — a pattern spanning \\n does not match", () => {
		const registry = new FilterRegistry([
			{
				name: "t",
				matchCommand: /cmd/,
				pipeline: { replace: [{ pattern: /A\nB/, replacement: "REPLACED" }] },
			},
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "A\nB");
		expect(result.output).toBe("A\nB"); // cross-line pattern never matches per-line replace
	});

	it("only-head case: headLines set, tailLines absent", () => {
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { headLines: 2 } },
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "L1\nL2\nL3\nL4");
		expect(result.output).toBe(`L1\nL2\n${OMITTED_LINES_MARKER(2)}`);
	});

	it("truncateLinesAt:0 truncates every line to '…'", () => {
		const registry = new FilterRegistry([
			{ name: "t", matchCommand: /cmd/, pipeline: { truncateLinesAt: 0 } },
		]);
		const engine = new FilterEngine(registry);
		const result = engine.process("cmd", "abc\ndef");
		expect(result.output).toBe("…\n…");
	});
});
