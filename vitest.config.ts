import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.spec.ts"],
		exclude: ["node_modules", "dist", ".worktrees"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"node_modules",
				"dist",
				"tests/**/*.spec.ts",
				"tests/fixtures/**",
				"**/*.d.ts",
				"vitest.config.ts",
				"commitlint.config.cjs",
			],
			thresholds: {
				lines: 85,
				functions: 85,
				branches: 80,
				statements: 85,
			},
		},
	},
});
