import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistry } from "../src/command-registry/index.js";
import { type ResolvedConfig, loadConfig } from "../src/config/index.js";

function makeTmpDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "token-saver-test-"));
}

function writeConfig(dir: string, _scope: "global" | "project", content: object) {
	const configDir = path.join(dir, ".pi", "token-saver");
	fs.mkdirSync(configDir, { recursive: true });
	fs.writeFileSync(path.join(configDir, "settings.json"), JSON.stringify(content));
}

describe("loadConfig", () => {
	let tmpDir: string;
	let originalHome: string | undefined;

	beforeEach(() => {
		tmpDir = makeTmpDir();
		originalHome = process.env.HOME;
		// Point HOME to an empty temp dir so the "global" config file is absent by default
		process.env.HOME = makeTmpDir();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		if (process.env.HOME && process.env.HOME !== originalHome) {
			fs.rmSync(process.env.HOME, { recursive: true, force: true });
		}
		if (originalHome !== undefined) process.env.HOME = originalHome;
		// biome-ignore lint/performance/noDelete: process.env requires delete to actually remove the key (assigning undefined coerces to string)
		else delete process.env.HOME;
	});

	it("returns defaults when no config files exist", () => {
		const result = loadConfig(tmpDir);
		expect(result).toEqual({ disabled: [], rules: [] });
	});

	it("loads disabled list from project config", () => {
		writeConfig(tmpDir, "project", { disabled: ["git-log"] });
		const result = loadConfig(tmpDir);
		expect(result.disabled).toContain("git-log");
	});

	it("merges disabled as union of global and project", () => {
		const globalDir = process.env.HOME as string;
		writeConfig(globalDir, "global", { disabled: ["git-status"] });
		writeConfig(tmpDir, "project", { disabled: ["git-log"] });
		const result = loadConfig(tmpDir);
		expect(result.disabled).toContain("git-status");
		expect(result.disabled).toContain("git-log");
	});

	it("places global rules before project rules", () => {
		const globalDir = process.env.HOME as string;
		writeConfig(globalDir, "global", {
			rules: [{ name: "global-rule", matchCommand: "^global", pipeline: { maxLines: 10 } }],
		});
		writeConfig(tmpDir, "project", {
			rules: [{ name: "project-rule", matchCommand: "^project", pipeline: { maxLines: 20 } }],
		});
		const result = loadConfig(tmpDir);
		expect(result.rules[0]?.name).toBe("global-rule");
		expect(result.rules[1]?.name).toBe("project-rule");
	});

	it("coerces matchCommand string to RegExp", () => {
		writeConfig(tmpDir, "project", {
			rules: [{ name: "my-rule", matchCommand: "\\bgit\\b", pipeline: {} }],
		});
		const result = loadConfig(tmpDir);
		expect(result.rules[0]?.matchCommand).toBeInstanceOf(RegExp);
		expect((result.rules[0]?.matchCommand as RegExp).test("git status")).toBe(true);
	});

	it("warns and skips a rule with invalid regex, other rules unaffected", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		writeConfig(tmpDir, "project", {
			rules: [
				{ name: "bad-rule", matchCommand: "[invalid", pipeline: {} },
				{ name: "good-rule", matchCommand: "^good", pipeline: {} },
			],
		});
		const result = loadConfig(tmpDir);
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.name).toBe("good-rule");
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("bad-rule"));
		warn.mockRestore();
	});

	it("warns and skips file with invalid JSON, other file still loads", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const globalDir = process.env.HOME as string;
		const globalConfigDir = path.join(globalDir, ".pi", "token-saver");
		fs.mkdirSync(globalConfigDir, { recursive: true });
		fs.writeFileSync(path.join(globalConfigDir, "settings.json"), "{ not json }");
		writeConfig(tmpDir, "project", { disabled: ["git-log"] });
		const result = loadConfig(tmpDir);
		expect(result.disabled).toContain("git-log");
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("warns and skips file with TypeBox validation error, other file still loads", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const globalDir = process.env.HOME as string;
		writeConfig(globalDir, "global", { disabled: 42 });
		writeConfig(tmpDir, "project", { disabled: ["git-log"] });
		const result = loadConfig(tmpDir);
		expect(result.disabled).toContain("git-log");
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("applies disabled to user-defined rules", () => {
		writeConfig(tmpDir, "project", {
			disabled: ["my-rule"],
			rules: [{ name: "my-rule", matchCommand: "^foo", pipeline: {} }],
		});
		const result = loadConfig(tmpDir);
		expect(result.disabled).toContain("my-rule");
		expect(result.rules[0]?.name).toBe("my-rule");
	});
});

describe("createRegistry with config", () => {
	it("user rules appear before built-in rules in registry", () => {
		const config: ResolvedConfig = {
			disabled: [],
			rules: [
				{
					name: "user-git-log",
					matchCommand: /\bgit\b.*\blog\b/,
					pipeline: { maxLines: 5 },
				},
			],
		};
		const registry = createRegistry(config);
		const rule = registry.find("git log --oneline");
		expect(rule?.name).toBe("user-git-log");
	});

	it("disabled removes built-in rule from registry", () => {
		const config: ResolvedConfig = { disabled: ["git-log"], rules: [] };
		const registry = createRegistry(config);
		const rule = registry.find("git log --oneline");
		expect(rule).toBeUndefined();
	});

	it("disabled removes user-defined rule from registry", () => {
		const config: ResolvedConfig = {
			disabled: ["my-rule"],
			rules: [
				{
					name: "my-rule",
					matchCommand: /^foo/,
					pipeline: {},
				},
			],
		};
		const registry = createRegistry(config);
		const rule = registry.find("foo bar");
		expect(rule).toBeUndefined();
	});

	it("zero-arg createRegistry loads all built-ins", () => {
		const registry = createRegistry();
		expect(registry.find("git log --oneline")).toBeDefined();
	});
});
