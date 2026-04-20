import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { searchRules } from "../../src/command-registry/search.js";
import { FilterEngine, FilterRegistry } from "../../src/filter-engine/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

describe("search rules", () => {
	const registry = new FilterRegistry(searchRules);
	const engine = new FilterEngine(registry);

	describe("grep", () => {
		const fixture = readFileSync(join(fixturesDir, "grep-large.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("grep -r foo .")?.name).toBe("grep");
		});

		it("caps at 150 lines + truncation marker", () => {
			const result = engine.process("grep -r foo .", fixture);
			const lines = result.output.split("\n");
			expect(lines.length).toBeGreaterThanOrEqual(151);
			expect(lines.length).toBeLessThanOrEqual(152);
			expect(result.output).toMatch(/lines truncated/);
		});
	});

	describe("rg", () => {
		const fixture = readFileSync(join(fixturesDir, "rg-large.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("rg foo")?.name).toBe("rg");
		});

		it("caps at 150 lines + truncation marker", () => {
			const result = engine.process("rg foo", fixture);
			const lines = result.output.split("\n");
			expect(lines.length).toBeGreaterThanOrEqual(151);
			expect(lines.length).toBeLessThanOrEqual(152);
		});
	});
});
