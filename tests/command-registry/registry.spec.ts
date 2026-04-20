import { describe, expect, it } from "vitest";
import { createRegistry } from "../../src/command-registry/index.js";
import { FilterEngine } from "../../src/filter-engine/index.js";

describe("createRegistry()", () => {
	const registry = createRegistry();
	const engine = new FilterEngine(registry);

	const representativeCommands: Array<[string, string]> = [
		["git-status", "git status"],
		["git-log", "git log --oneline"],
		["git-diff", "git diff HEAD~1"],
		["git-show", "git show HEAD"],
		["git-blame", "git blame src/index.ts"],
		["pm-install", "npm install"],
		["pm-run", "npm run build"],
		["turbo-run", "turbo run build"],
		["vitest", "vitest run"],
		["jest", "jest --runInBand"],
		["bun-test", "bun test"],
		["tsc", "tsc --noEmit"],
		["ls", "ls -la"],
		["find", 'find . -name "*.ts"'],
		["docker-ps", "docker ps -a"],
		["docker-images", "docker images"],
		["docker-logs", "docker logs my-container"],
		["docker-build", "docker build -t app ."],
		["curl", "curl -v https://api.example.com"],
		["http", "http GET https://api.example.com"],
		["grep", "grep -r foo ."],
		["rg", "rg foo"],
	];

	it("AC-01: find() returns a rule for all 22 representative commands", () => {
		for (const [name, command] of representativeCommands) {
			const rule = registry.find(command);
			expect(rule, `expected rule for "${command}"`).toBeDefined();
			expect(rule?.name).toBe(name);
		}
	});

	it("AC-05: all four package managers resolve to pm-install", () => {
		expect(registry.find("npm install")?.name).toBe("pm-install");
		expect(registry.find("yarn install")?.name).toBe("pm-install");
		expect(registry.find("pnpm install")?.name).toBe("pm-install");
		expect(registry.find("bun install")?.name).toBe("pm-install");
	});

	it("smoke: engine processes git status without throwing", () => {
		const result = engine.process("git status", 'On branch main\n  (use "git add")\n');
		expect(result.matched).toBe(true);
	});

	it("disabled list filters out a rule by name", () => {
		const r = createRegistry({ disabled: ["docker-logs"], rules: [] });
		expect(r.find("docker logs foo")).toBeUndefined();
		expect(r.find("docker ps")).toBeDefined();
	});
});
