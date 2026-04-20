import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { goRules } from "../../src/command-registry/go.js";
import { FilterEngine, FilterRegistry } from "../../src/filter-engine/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

describe("go rules", () => {
	const registry = new FilterRegistry(goRules);
	const engine = new FilterEngine(registry);

	describe("go-build", () => {
		it("AC-01: find() returns rule", () => {
			expect(registry.find("go build ./...")?.name).toBe("go-build");
		});

		it("returns 'Build succeeded.' on empty stdout", () => {
			const result = engine.process("go build", "");
			expect(result.output).toBe("Build succeeded.");
		});

		it("keeps # pkg headers and .go:line:col: errors", () => {
			const fixture = readFileSync(join(fixturesDir, "go-build-error.txt"), "utf-8");
			const result = engine.process("go build", fixture);
			expect(result.output).toContain("# example.com/foo");
			expect(result.output).toContain("./main.go:5:2: undefined");
		});
	});

	describe("go-test", () => {
		it("AC-01: find() returns rule", () => {
			expect(registry.find("go test ./...")?.name).toBe("go-test");
		});

		it("collapses all-pass to 'All tests passed.'", () => {
			const fixture = readFileSync(join(fixturesDir, "go-test-pass.txt"), "utf-8");
			const result = engine.process("go test", fixture);
			expect(result.output).toBe("All tests passed.");
		});

		it("does not collapse on failure (unless catches FAIL/--- FAIL)", () => {
			const fixture = readFileSync(join(fixturesDir, "go-test-fail.txt"), "utf-8");
			const result = engine.process("go test", fixture);
			expect(result.output).not.toBe("All tests passed.");
			expect(result.output).toContain("--- FAIL: TestFoo");
			expect(result.output).toContain("FAIL\texample.com/foo");
		});

		it("caps at 100 lines on large failure output", () => {
			const fixture = readFileSync(join(fixturesDir, "go-test-large-fail.txt"), "utf-8");
			const result = engine.process("go test", fixture);
			const lines = result.output.split("\n").filter((l) => l !== "");
			expect(lines.length).toBeLessThanOrEqual(101);
			expect(result.output).toContain("lines truncated");
		});
	});

	describe("negative matching", () => {
		it.each(["go mod tidy", "go run main.go", "go vet ./...", "go generate"])(
			"%s does NOT match any go rule",
			(cmd) => {
				expect(registry.find(cmd)).toBeUndefined();
			},
		);
	});
});
