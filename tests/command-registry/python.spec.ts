import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pythonRules } from "../../src/command-registry/python.js";
import { FilterEngine, FilterRegistry } from "../../src/filter-engine/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

describe("python rules", () => {
	const registry = new FilterRegistry(pythonRules);
	const engine = new FilterEngine(registry);

	describe("python-install match coverage", () => {
		it.each([
			"pip install requests",
			"pip3 install requests",
			"uv add requests",
			"uv sync",
			"uv lock",
			"uv pip install requests",
			"uv tool install ruff",
			"poetry add requests",
			"poetry install",
			"poetry update",
			"poetry lock",
			"poetry remove requests",
		])("%s matches python-install", (cmd) => {
			expect(registry.find(cmd)?.name).toBe("python-install");
		});

		it.each([
			"uv run pytest",
			"poetry run pytest",
			"poetry shell",
			"poetry show",
			"pip list",
			"pip show requests",
			'echo "pip install failed"',
		])("%s does NOT match python-install", (cmd) => {
			expect(registry.find(cmd)).toBeUndefined();
		});
	});

	describe("python-install behavior", () => {
		it("collapses pip success to 'Install succeeded.'", () => {
			const fixture = readFileSync(join(fixturesDir, "pip-install-success.txt"), "utf-8");
			const result = engine.process("pip install requests", fixture);
			expect(result.output).toBe("Install succeeded.");
		});

		it("keeps ERROR lines on pip failure", () => {
			const fixture = readFileSync(join(fixturesDir, "pip-install-error.txt"), "utf-8");
			const result = engine.process("pip install requests", fixture);
			expect(result.output).not.toBe("Install succeeded.");
			expect(result.output).toContain("ERROR: Could not find");
		});

		it("uv-sync retains Installed summary line", () => {
			const fixture = readFileSync(join(fixturesDir, "uv-sync-success.txt"), "utf-8");
			const result = engine.process("uv sync", fixture);
			expect(result.output).toContain("Installed 3 packages");
		});

		it("poetry-install collapses to 'Install succeeded.' via onEmpty (bullet lines filtered out)", () => {
			const fixture = readFileSync(join(fixturesDir, "poetry-install-success.txt"), "utf-8");
			const result = engine.process("poetry install", fixture);
			expect(result.output).toBe("Install succeeded.");
		});

		it("caps at 100 lines on large output", () => {
			const fixture = readFileSync(join(fixturesDir, "python-install-large.txt"), "utf-8");
			const result = engine.process("pip install foo", fixture);
			const lines = result.output.split("\n").filter((l) => l !== "");
			expect(lines.length).toBeLessThanOrEqual(101);
			expect(result.output).toContain("lines truncated");
		});
	});
});
