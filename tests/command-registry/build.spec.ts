import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRules } from "../../src/command-registry/build.js";
import { FilterEngine, FilterRegistry } from "../../src/filter-engine/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

describe("build rules", () => {
	const registry = new FilterRegistry(buildRules);
	const engine = new FilterEngine(registry);

	describe("build-tools match coverage", () => {
		it.each(["make", "make -j4", "make install", "cmake .", "cmake --build ."])(
			"%s matches build-tools",
			(cmd) => {
				expect(registry.find(cmd)?.name).toBe("build-tools");
			},
		);
	});

	describe("build-tools behavior", () => {
		it("clean make (recipe echoes only) collapses via onEmpty", () => {
			const fixture = readFileSync(join(fixturesDir, "make-clean.txt"), "utf-8");
			const result = engine.process("make", fixture);
			expect(result.output).toBe("Build succeeded.");
		});

		it("keeps compiler error/warning and make *** Error N", () => {
			const fixture = readFileSync(join(fixturesDir, "make-error.txt"), "utf-8");
			const result = engine.process("make", fixture);
			expect(result.output).toContain("foo.c:5:2: error:");
			expect(result.output).toContain("foo.c:6:3: warning:");
			expect(result.output).toContain("Error 1");
		});

		it("keeps CMake Error/Warning lines", () => {
			const fixture = readFileSync(join(fixturesDir, "cmake-error.txt"), "utf-8");
			const result = engine.process("cmake .", fixture);
			expect(result.output).toContain("CMake Error at CMakeLists.txt:5");
			expect(result.output).toContain("CMake Warning");
		});

		it("keeps undefined reference lines", () => {
			const result = engine.process("make", "foo.o: undefined reference to `baz'");
			expect(result.output).toContain("undefined reference");
		});

		it("caps at 100 lines on large error output", () => {
			const fixture = readFileSync(join(fixturesDir, "make-large-error.txt"), "utf-8");
			const result = engine.process("make", fixture);
			const lines = result.output.split("\n").filter((l) => l !== "");
			expect(lines.length).toBeLessThanOrEqual(101);
			expect(result.output).toContain("lines truncated");
		});
	});
});
