import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packageManagerRules } from "../../src/command-registry/package-manager.js";
import { FilterEngine, FilterRegistry } from "../../src/filter-engine/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

describe("package-manager rules", () => {
	const registry = new FilterRegistry(packageManagerRules);
	const engine = new FilterEngine(registry);

	describe("pm-install", () => {
		const fixture = readFileSync(join(fixturesDir, "npm-install.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("npm install")).toBeDefined();
		});

		it("AC-05: all four package managers resolve to pm-install", () => {
			expect(registry.find("npm install")?.name).toBe("pm-install");
			expect(registry.find("yarn install")?.name).toBe("pm-install");
			expect(registry.find("pnpm install")?.name).toBe("pm-install");
			expect(registry.find("bun install")?.name).toBe("pm-install");
		});

		it("AC-02: compresses ≥10%", () => {
			const result = engine.process("npm install", fixture);
			expect(result.matched).toBe(true);
			expect(result.bytesAfter).toBeLessThanOrEqual(0.9 * result.bytesBefore);
		});

		it("AC-03: error lines preserved", () => {
			const result = engine.process("npm install", fixture);
			expect(result.output).toContain("npm error");
		});

		it("drops spinner/progress lines", () => {
			const result = engine.process("npm install", fixture);
			expect(result.output).not.toContain("Installing packages: 1/");
		});
	});

	describe("turbo-run (AC-06)", () => {
		const fixture = readFileSync(join(fixturesDir, "turbo-run.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("turbo run build")?.name).toBe("turbo-run");
		});

		it("AC-02: compresses ≥10%", () => {
			const result = engine.process("turbo run build", fixture);
			expect(result.matched).toBe(true);
			expect(result.bytesAfter).toBeLessThanOrEqual(0.9 * result.bytesBefore);
		});

		it("AC-06: retains error lines from failing package", () => {
			const result = engine.process("turbo run build", fixture);
			expect(result.output).toContain("error TS2345");
			expect(result.output).toContain("error: build failed");
		});

		it("AC-06: retains Tasks: summary line", () => {
			const result = engine.process("turbo run build", fixture);
			expect(result.output).toContain("Tasks:");
		});

		it("AC-06: drops verbose passing-package lines", () => {
			const result = engine.process("turbo run build", fixture);
			expect(result.output).not.toContain("✓ Generating static pages");
			expect(result.output).not.toContain("✓ Compiled successfully");
		});
	});
});
