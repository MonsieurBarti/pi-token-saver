import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { networkRules } from "../../src/command-registry/network.js";
import { FilterEngine, FilterRegistry } from "../../src/filter-engine/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

describe("network rules", () => {
	const registry = new FilterRegistry(networkRules);
	const engine = new FilterEngine(registry);

	describe("curl", () => {
		const fixture = readFileSync(join(fixturesDir, "curl-verbose.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("curl -v https://example.com")?.name).toBe("curl");
		});

		it("strips <, >, * prefixed lines", () => {
			const result = engine.process("curl -v https://example.com", fixture);
			const lines = result.output.split("\n");
			for (const line of lines) {
				expect(line).not.toMatch(/^[<>*]\s/);
			}
		});

		it("preserves body lines", () => {
			const result = engine.process("curl -v https://example.com", fixture);
			expect(result.output).toContain("<!doctype html>");
			expect(result.output).toContain("Hello");
		});

		it('does NOT match command text containing "curl" not at start', () => {
			expect(registry.find('echo "curl failed"')).toBeUndefined();
		});
	});

	describe("http", () => {
		const fixture = readFileSync(join(fixturesDir, "http-output.txt"), "utf-8");

		it("AC-01: find() returns rule", () => {
			expect(registry.find("http GET https://example.com")?.name).toBe("http");
		});

		it("strips HTTP/1.1 status line", () => {
			const result = engine.process("http GET https://example.com", fixture);
			expect(result.output).not.toMatch(/^HTTP\//m);
		});

		it("preserves body", () => {
			const result = engine.process("http GET https://example.com", fixture);
			expect(result.output).toContain('"message": "hello world"');
		});

		it("does NOT match http-server command", () => {
			expect(registry.find("http-server -p 8080")).toBeUndefined();
		});

		it("does NOT match a bare URL argument", () => {
			expect(registry.find("https://example.com")).toBeUndefined();
		});
	});
});
