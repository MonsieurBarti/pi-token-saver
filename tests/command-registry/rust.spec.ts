import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rustRules } from "../../src/command-registry/rust.js";
import { FilterEngine, FilterRegistry } from "../../src/filter-engine/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

describe("rust rules", () => {
	const registry = new FilterRegistry(rustRules);
	const engine = new FilterEngine(registry);

	describe("cargo-build", () => {
		it("AC-01: find() returns rule", () => {
			expect(registry.find("cargo build --release")?.name).toBe("cargo-build");
		});

		it("collapses clean build (Finished + warning) to 'Build succeeded.'", () => {
			const fixture = readFileSync(join(fixturesDir, "cargo-build-clean.txt"), "utf-8");
			const result = engine.process("cargo build", fixture);
			expect(result.output).toBe("Build succeeded.");
		});

		it("does not collapse on error; keeps error/snippet lines", () => {
			const fixture = readFileSync(join(fixturesDir, "cargo-build-error.txt"), "utf-8");
			const result = engine.process("cargo build", fixture);
			expect(result.output).not.toBe("Build succeeded.");
			expect(result.output).toContain("error[E0425]");
			expect(result.output).toContain("--> src/main.rs:3:5");
			expect(result.output).toContain("= help:");
		});

		it("preserves Compiling lines in non-clean state", () => {
			const fixture = readFileSync(join(fixturesDir, "cargo-build-large.txt"), "utf-8");
			const result = engine.process("cargo build", fixture);
			expect(result.output).toMatch(/Compiling crate-/);
		});

		it("caps at 150 lines", () => {
			const fixture = readFileSync(join(fixturesDir, "cargo-build-large.txt"), "utf-8");
			const result = engine.process("cargo build", fixture);
			const lines = result.output.split("\n").filter((l) => l !== "");
			expect(lines.length).toBeLessThanOrEqual(151);
			expect(result.output).toContain("lines truncated");
		});

		it("strips ANSI sequences", () => {
			const result = engine.process("cargo build", "\x1b[31merror\x1b[0m[E0001]: x");
			// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI test
			expect(result.output).not.toMatch(/\x1b\[/);
		});
	});

	describe("cargo-test", () => {
		it("AC-01: find() returns rule", () => {
			expect(registry.find("cargo test")?.name).toBe("cargo-test");
		});

		it("collapses pass to 'All tests passed.'", () => {
			const fixture = readFileSync(join(fixturesDir, "cargo-test-pass.txt"), "utf-8");
			const result = engine.process("cargo test", fixture);
			expect(result.output).toBe("All tests passed.");
		});

		it("keeps FAILED and panicked lines on fail", () => {
			const fixture = readFileSync(join(fixturesDir, "cargo-test-fail.txt"), "utf-8");
			const result = engine.process("cargo test", fixture);
			expect(result.output).not.toBe("All tests passed.");
			expect(result.output).toContain("FAILED");
			expect(result.output).toContain("panicked");
		});

		it("does not collapse on workspace-mixed output (unless catches FAILED)", () => {
			const fixture = readFileSync(join(fixturesDir, "cargo-test-workspace-mixed.txt"), "utf-8");
			const result = engine.process("cargo test", fixture);
			expect(result.output).not.toBe("All tests passed.");
			expect(result.output).toContain("FAILED");
		});

		it("caps at 150 lines on large failure output", () => {
			const fixture = readFileSync(join(fixturesDir, "cargo-test-large.txt"), "utf-8");
			const result = engine.process("cargo test", fixture);
			const lines = result.output.split("\n").filter((l) => l !== "");
			expect(lines.length).toBeLessThanOrEqual(151);
			expect(result.output).toContain("lines truncated");
		});
	});

	describe("negative matching", () => {
		it("cargo check does NOT match either rust rule", () => {
			expect(registry.find("cargo check")).toBeUndefined();
		});
		it("cargo run does NOT match either rust rule", () => {
			expect(registry.find("cargo run")).toBeUndefined();
		});
	});
});
