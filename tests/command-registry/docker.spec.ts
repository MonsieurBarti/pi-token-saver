import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dockerRules } from "../../src/command-registry/docker.js";
import { FilterEngine, FilterRegistry } from "../../src/filter-engine/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

describe("docker rules", () => {
	const registry = new FilterRegistry(dockerRules);
	const engine = new FilterEngine(registry);

	describe("docker-ps", () => {
		const fixture = readFileSync(join(fixturesDir, "docker-ps.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("docker ps -a")?.name).toBe("docker-ps");
		});

		it("strips CONTAINER ID header line", () => {
			const result = engine.process("docker ps", fixture);
			expect(result.output.startsWith("CONTAINER ID")).toBe(false);
		});

		it("caps at 50 lines", () => {
			const result = engine.process("docker ps", fixture);
			const lines = result.output.split("\n").filter((l) => l !== "");
			expect(lines.length).toBeLessThanOrEqual(51);
			expect(result.output).toContain("lines truncated");
		});
	});

	describe("docker-images", () => {
		const fixture = readFileSync(join(fixturesDir, "docker-images.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("docker images")?.name).toBe("docker-images");
		});

		it("strips REPOSITORY header line", () => {
			const result = engine.process("docker images", fixture);
			expect(result.output.startsWith("REPOSITORY")).toBe(false);
		});

		it("caps at 50 lines", () => {
			const result = engine.process("docker images", fixture);
			const lines = result.output.split("\n").filter((l) => l !== "");
			expect(lines.length).toBeLessThanOrEqual(51);
		});
	});

	describe("docker-logs", () => {
		const fixture = readFileSync(join(fixturesDir, "docker-logs.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("docker logs my-container")?.name).toBe("docker-logs");
		});

		it("strips ANSI sequences", () => {
			const result = engine.process("docker logs my-container", fixture);
			// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI test
			expect(result.output).not.toMatch(/\x1b\[/);
		});

		it("applies head(20) + marker + tail(80) on ≥120-line input", () => {
			const result = engine.process("docker logs my-container", fixture);
			const lines = result.output.split("\n");
			expect(lines.length).toBeGreaterThanOrEqual(101);
			expect(lines.length).toBeLessThanOrEqual(102);
			expect(lines[20]).toMatch(/lines omitted/);
		});
	});

	describe("docker-build", () => {
		const fixture = readFileSync(join(fixturesDir, "docker-build.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("docker build -t app .")?.name).toBe("docker-build");
		});

		it("strips ANSI sequences", () => {
			const result = engine.process("docker build .", fixture);
			// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI test
			expect(result.output).not.toMatch(/\x1b\[/);
		});

		it("applies head(20) + marker + tail(80) on ≥120-line input", () => {
			const result = engine.process("docker build .", fixture);
			const lines = result.output.split("\n");
			expect(lines.length).toBeGreaterThanOrEqual(101);
			expect(lines.length).toBeLessThanOrEqual(102);
		});
	});

	describe("negative matching", () => {
		it("docker compose ps does NOT match any docker rule", () => {
			expect(registry.find("docker compose ps")).toBeUndefined();
		});

		it("docker container ls does NOT match any docker rule", () => {
			expect(registry.find("docker container ls")).toBeUndefined();
		});

		it("docker-compose logs does NOT match any docker rule", () => {
			expect(registry.find("docker-compose logs")).toBeUndefined();
		});
	});
});
