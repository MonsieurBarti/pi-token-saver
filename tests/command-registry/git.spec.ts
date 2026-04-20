import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitRules } from "../../src/command-registry/git.js";
import { FilterEngine, FilterRegistry } from "../../src/filter-engine/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

describe("git rules", () => {
	const registry = new FilterRegistry(gitRules);
	const engine = new FilterEngine(registry);

	describe("git-log", () => {
		const fixture = readFileSync(join(fixturesDir, "git-log.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("git log --oneline")).toBeDefined();
		});

		it("AC-02: compresses ≥10%", () => {
			const result = engine.process("git log --oneline", fixture);
			expect(result.matched).toBe(true);
			expect(result.bytesAfter).toBeLessThanOrEqual(0.9 * result.bytesBefore);
		});

		it("AC-03: error-signal lines preserved", () => {
			const withError =
				"commit abc123\nAuthor: A <a@b.com>\nDate:   Mon\n\n    fix: resolve ERROR in parser\n";
			const result = engine.process("git log", withError);
			expect(result.output).toContain("ERROR");
		});

		it("drops blank lines between commits", () => {
			const result = engine.process("git log", fixture);
			expect(result.output).not.toMatch(/^\s*$/m);
		});

		it("has imageOnlyFallback containing '--no-pager'", () => {
			const rule = gitRules.find((r) => r.name === "git-log");
			expect(rule?.imageOnlyFallback).toMatch(/--no-pager/);
		});
	});

	describe("git-status", () => {
		const fixture = readFileSync(join(fixturesDir, "git-status.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("git status")).toBeDefined();
		});

		it("AC-02: compresses ≥10%", () => {
			const result = engine.process("git status", fixture);
			expect(result.matched).toBe(true);
			expect(result.bytesAfter).toBeLessThanOrEqual(0.9 * result.bytesBefore);
		});

		it("strips hint lines", () => {
			const result = engine.process("git status", fixture);
			expect(result.output).not.toContain('(use "git');
		});

		it("preserves modified file paths", () => {
			const result = engine.process("git status", fixture);
			expect(result.output).toContain("modified:");
		});
	});

	describe("git-diff", () => {
		const fixture = readFileSync(join(fixturesDir, "git-diff.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("git diff HEAD~1")).toBeDefined();
		});

		it("AC-02: compresses ≥10% (250-line fixture truncated to 200 by maxLines)", () => {
			const result = engine.process("git diff HEAD~1", fixture);
			expect(result.matched).toBe(true);
			expect(result.bytesAfter).toBeLessThanOrEqual(0.9 * result.bytesBefore);
		});
	});

	describe("git-show", () => {
		it("AC-01: find() returns rule", () => {
			expect(registry.find("git show HEAD")).toBeDefined();
		});
	});

	describe("git-blame", () => {
		it("AC-01: find() returns rule", () => {
			expect(registry.find("git blame src/index.ts")).toBeDefined();
		});
	});
});
