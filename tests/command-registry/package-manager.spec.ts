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
		const npm = readFileSync(join(fixturesDir, "npm-install.txt"), "utf-8");
		const pnpm = readFileSync(join(fixturesDir, "pnpm-install.txt"), "utf-8");
		const yarn = readFileSync(join(fixturesDir, "yarn-install.txt"), "utf-8");
		const bun = readFileSync(join(fixturesDir, "bun-install.txt"), "utf-8");

		it("matches install/add/i for all four managers", () => {
			expect(registry.find("npm install")?.name).toBe("pm-install");
			expect(registry.find("npm i")?.name).toBe("pm-install");
			expect(registry.find("npm add foo")?.name).toBe("pm-install");
			expect(registry.find("pnpm install")?.name).toBe("pm-install");
			expect(registry.find("pnpm i")?.name).toBe("pm-install");
			expect(registry.find("pnpm add foo")?.name).toBe("pm-install");
			expect(registry.find("yarn install")?.name).toBe("pm-install");
			expect(registry.find("yarn add foo")?.name).toBe("pm-install");
			expect(registry.find("bun install")?.name).toBe("pm-install");
			expect(registry.find("bun i")?.name).toBe("pm-install");
			expect(registry.find("bun add foo")?.name).toBe("pm-install");
			expect(registry.find("  npm install")?.name).toBe("pm-install");
		});

		it("strips npm summary-noise lines", () => {
			const result = engine.process("npm install", npm);
			expect(result.matched).toBe(true);
			expect(result.output).not.toMatch(/^added \d+ packages/m);
			expect(result.output).not.toMatch(/^\d+ packages are looking for funding/m);
			expect(result.output).not.toMatch(/Run `npm audit`/);
			expect(result.output).not.toMatch(/^To address/m);
		});

		it("strips pnpm progress + summary-noise lines", () => {
			const result = engine.process("pnpm install", pnpm);
			expect(result.output).not.toMatch(/^Progress: resolved /m);
			expect(result.output).not.toMatch(/^\+{2,}$/m);
			expect(result.output).not.toMatch(/^Packages: \+/m);
			expect(result.output).not.toMatch(/^dependencies:$/m);
			expect(result.output).not.toMatch(/^Done in \d+ms using pnpm/m);
		});

		it("strips yarn progress + summary-noise lines", () => {
			const result = engine.process("yarn install", yarn);
			expect(result.output).not.toMatch(/^\[\d\/\d\] /m);
			expect(result.output).not.toMatch(/^yarn install v/m);
			expect(result.output).not.toMatch(/^info No lockfile found\.$/m);
			expect(result.output).not.toMatch(/^success Saved lockfile\.$/m);
			expect(result.output).not.toMatch(/^Done in \d+(\.\d+)?s\.$/m);
		});

		it("strips bun summary-noise lines", () => {
			const result = engine.process("bun install", bun);
			expect(result.output).not.toMatch(/^bun install v/m);
			expect(result.output).not.toMatch(/^Saved lockfile$/m);
			expect(result.output).not.toMatch(/^\+ \S+@/m);
			expect(result.output).not.toMatch(/^\d+ packages installed \[/m);
		});

		it("preserves error/warn lines", () => {
			const synthetic = [
				"npm error ENOENT /some/path",
				"npm warn deprecated foo@1.2.3",
				"added 5 packages",
				"up to date in 1s",
			].join("\n");
			const result = engine.process("npm install", synthetic);
			expect(result.output).toContain("npm error ENOENT");
			expect(result.output).toContain("npm warn deprecated");
		});

		it("caps output at 100 lines", () => {
			const huge = Array.from({ length: 500 }, (_, i) => `custom line ${i}`).join("\n");
			const result = engine.process("npm install", huge);
			const outLines = result.output.split("\n");
			expect(outLines.length).toBeLessThanOrEqual(101);
		});
	});

	describe("pm-ls", () => {
		const npm = readFileSync(join(fixturesDir, "npm-ls.txt"), "utf-8");
		const pnpm = readFileSync(join(fixturesDir, "pnpm-ls.txt"), "utf-8");
		const yarn = readFileSync(join(fixturesDir, "yarn-ls.txt"), "utf-8");
		const bun = readFileSync(join(fixturesDir, "bun-ls.txt"), "utf-8");

		it("matches ls/list for all four managers", () => {
			expect(registry.find("npm ls")?.name).toBe("pm-ls");
			expect(registry.find("npm list")?.name).toBe("pm-ls");
			expect(registry.find("pnpm ls")?.name).toBe("pm-ls");
			expect(registry.find("pnpm list")?.name).toBe("pm-ls");
			expect(registry.find("yarn ls")?.name).toBe("pm-ls");
			expect(registry.find("yarn list")?.name).toBe("pm-ls");
			expect(registry.find("bun ls")?.name).toBe("pm-ls");
			expect(registry.find("bun list")?.name).toBe("pm-ls");
		});

		it("does NOT match install-family commands", () => {
			expect(registry.find("npm install")?.name).not.toBe("pm-ls");
			expect(registry.find("pnpm add foo")?.name).not.toBe("pm-ls");
		});

		it("pass-through for input ≤ 100 lines (bun-ls, 76 lines)", () => {
			const result = engine.process("bun ls", bun);
			expect(result.matched).toBe(true);
			const expected = bun.replace(/\r\n|\r/g, "\n").split("\n").length;
			const outLines = result.output.split("\n");
			expect(outLines.length).toBe(expected);
			expect(result.output).not.toContain("lines omitted");
		});

		it("head-20 + tail-80 + single marker for input > 100 lines (npm-ls, 135 lines)", () => {
			const result = engine.process("npm ls", npm);
			const outLines = result.output.split("\n");
			expect(outLines.length).toBe(101);
			expect(outLines[20]).toMatch(/lines omitted/);
			expect(outLines.filter((l) => l.includes("lines omitted")).length).toBe(1);
			expect(outLines.filter((l) => l.includes("lines truncated")).length).toBe(0);
		});

		it("head-20 + tail-80 + single marker for pnpm-ls (256 lines)", () => {
			const result = engine.process("pnpm ls", pnpm);
			const outLines = result.output.split("\n");
			expect(outLines.length).toBe(101);
			expect(outLines.filter((l) => l.includes("lines truncated")).length).toBe(0);
		});

		it("head-20 + tail-80 + single marker for yarn-ls (207 lines)", () => {
			const result = engine.process("yarn list", yarn);
			const outLines = result.output.split("\n");
			expect(outLines.length).toBe(101);
			expect(outLines.filter((l) => l.includes("lines truncated")).length).toBe(0);
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
