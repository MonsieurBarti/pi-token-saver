import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileListingRules } from "../../src/command-registry/file-listing.js";
import { FilterEngine, FilterRegistry } from "../../src/filter-engine/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

describe("file-listing rules", () => {
	const registry = new FilterRegistry(fileListingRules);
	const engine = new FilterEngine(registry);

	describe("ls", () => {
		const fixture = readFileSync(join(fixturesDir, "ls-output.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("ls -la")).toBeDefined();
		});

		it("AC-02: compresses ≥10% (maxLines:50 on 70-line fixture)", () => {
			const result = engine.process("ls -la", fixture);
			expect(result.matched).toBe(true);
			expect(result.bytesAfter).toBeLessThanOrEqual(0.9 * result.bytesBefore);
		});

		it('does not match "false" or "cls" commands', () => {
			expect(registry.find("false")).toBeUndefined();
			expect(registry.find("cls")).toBeUndefined();
		});
	});

	describe("find", () => {
		const fixture = readFileSync(join(fixturesDir, "find-output.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find('find . -name "*.ts"')).toBeDefined();
		});

		it("AC-08: Permission denied lines stripped", () => {
			const result = engine.process('find . -name "*.ts"', fixture);
			expect(result.output).not.toContain("Permission denied");
			expect(result.output).not.toContain("Operation not permitted");
		});

		it("AC-08: valid path lines present and unchanged", () => {
			const result = engine.process('find . -name "*.ts"', fixture);
			expect(result.output).toContain("./src/auth/middleware.ts");
			expect(result.output).toContain("./src/filter-engine/index.ts");
			expect(result.output).toContain("./package.json");
		});
	});
});
