import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { testRunnerRules } from "../../src/command-registry/test-runner.js";
import { FilterEngine, FilterRegistry } from "../../src/filter-engine/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

describe("test-runner rules", () => {
	const registry = new FilterRegistry(testRunnerRules);
	const engine = new FilterEngine(registry);

	describe("vitest", () => {
		const failFixture = readFileSync(join(fixturesDir, "vitest-fail.txt"), "utf-8");
		const passFixture = readFileSync(join(fixturesDir, "vitest-pass.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("vitest run")).toBeDefined();
		});

		it("AC-02: compresses fail output ≥10%", () => {
			const result = engine.process("vitest run", failFixture);
			expect(result.matched).toBe(true);
			expect(result.bytesAfter).toBeLessThanOrEqual(0.9 * result.bytesBefore);
		});

		it("AC-03: FAIL line preserved in fail output", () => {
			const result = engine.process("vitest run", failFixture);
			expect(result.output).toContain("FAIL");
		});

		it("AC-03: AssertionError preserved in fail output", () => {
			const result = engine.process("vitest run", failFixture);
			expect(result.output).toContain("AssertionError");
		});

		it('AC-04: all-pass fixture produces exactly "All tests passed."', () => {
			const result = engine.process("vitest run", passFixture);
			expect(result.output).toBe("All tests passed.");
		});

		it("drops ✓ passing lines in fail output", () => {
			const result = engine.process("vitest run", failFixture);
			expect(result.output).not.toContain("src/auth/login.spec.ts (3 tests) 12ms");
		});
	});

	describe("jest", () => {
		const failFixture = readFileSync(join(fixturesDir, "jest-fail.txt"), "utf-8");
		const passFixture = readFileSync(join(fixturesDir, "jest-pass.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("jest --runInBand")).toBeDefined();
		});

		it("AC-02: compresses fail output ≥10%", () => {
			const result = engine.process("jest --runInBand", failFixture);
			expect(result.matched).toBe(true);
			expect(result.bytesAfter).toBeLessThanOrEqual(0.9 * result.bytesBefore);
		});

		it("AC-03: FAIL line preserved", () => {
			const result = engine.process("jest --runInBand", failFixture);
			expect(result.output).toContain("FAIL");
		});

		it('AC-04: all-pass fixture produces exactly "All tests passed."', () => {
			const result = engine.process("jest --runInBand", passFixture);
			expect(result.output).toBe("All tests passed.");
		});

		it("drops PASS lines in fail output", () => {
			const result = engine.process("jest --runInBand", failFixture);
			expect(result.output).not.toContain("PASS src/auth/login");
		});
	});

	describe("bun-test", () => {
		const passFixture = readFileSync(join(fixturesDir, "bun-test-pass.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("bun test")).toBeDefined();
		});

		it('AC-04: all-pass fixture produces exactly "All tests passed."', () => {
			const result = engine.process("bun test", passFixture);
			expect(result.output).toBe("All tests passed.");
		});
	});

	describe("tsc", () => {
		const errorsFixture = readFileSync(join(fixturesDir, "tsc-errors.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("tsc --noEmit")).toBeDefined();
		});

		it("AC-02: compresses ≥10%", () => {
			const result = engine.process("tsc --noEmit", errorsFixture);
			expect(result.matched).toBe(true);
			expect(result.bytesAfter).toBeLessThanOrEqual(0.9 * result.bytesBefore);
		});

		it("AC-03: error TS lines preserved", () => {
			const result = engine.process("tsc --noEmit", errorsFixture);
			expect(result.output).toContain("error TS2345");
			expect(result.output).toContain("error TS2551");
		});

		it('AC-07: empty input produces "No TypeScript errors."', () => {
			const result = engine.process("tsc --noEmit", "");
			expect(result.output).toBe("No TypeScript errors.");
		});
	});
});
