<div align="center">
  <img src="https://raw.githubusercontent.com/MonsieurBarti/The-Forge-Flow-CC/refs/heads/main/assets/forge-banner.png" alt="The Forge Flow" width="100%">

  <h1>💰 Token Saver PI Extension</h1>

  <p>
    <strong>Intelligent bash output filtering to reduce token consumption</strong>
  </p>

  <p>
    <a href="https://github.com/MonsieurBarti/pi-token-saver/actions/workflows/ci.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/MonsieurBarti/pi-token-saver/ci.yml?label=CI&style=flat-square" alt="CI Status">
    </a>
    <a href="https://www.npmjs.com/package/@the-forge-flow/pi-token-saver">
      <img src="https://img.shields.io/npm/v/@the-forge-flow/pi-token-saver?style=flat-square" alt="npm version">
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/github/license/MonsieurBarti/pi-token-saver?style=flat-square" alt="License">
    </a>
  </p>
</div>

---

## ✨ Features

- **🔍 Smart filtering**: Intercepts bash command output and applies targeted filters to strip verbose content
- **📊 Multi-domain rules**: Built-in filters for git, package managers, test runners, and file listing commands
- **📈 Savings tracking**: Records bytes/tokens saved per session with historical reports
- **🔎 Discovery mode**: Identifies commands that could benefit from new filter rules
- **🚦 Passthrough mode**: One-shot bypass for debugging or when full output is needed
- **⚡ Zero-config**: Works out of the box with sensible defaults

## 🎯 How It Works

The extension hooks into PI's `tool_result` event for bash commands. When a bash command completes, the output is matched against a registry of filter rules. If a rule matches, the output is processed through a configurable pipeline:

1. **stripAnsi** — Remove ANSI escape sequences
2. **replace** — Apply regex replacements
3. **matchOutput** — Return a short message for known patterns (e.g., "All tests passed.")
4. **stripLinesMatching/keepLinesMatching** — Filter lines by regex
5. **truncateLinesAt** — Truncate long lines with a marker
6. **headLines/tailLines** — Keep only head/tail with omission marker
7. **maxLines** — Hard cap on total lines
8. **onEmpty** — Fallback message when output is empty after filtering

## 📦 Installation

**From npm:**

```bash
pi install npm:@the-forge-flow/pi-token-saver
```

**From GitHub:**

```bash
pi install git:github.com/MonsieurBarti/pi-token-saver
```

Then reload PI with `/reload`.

## 🚀 Usage

### Commands

| Command | Description |
|---|---|
| `/token-saver:gain` | Show savings report — bytes and estimated tokens saved this session and historically |
| `/token-saver:discover` | Show commands that ran without a filter rule, ranked by average output size |
| `/token-saver:passthrough` | Bypass filtering for the next bash command (one-shot) |

### Built-in Filter Rules

#### Git Commands

| Command | Filter |
|---|---|
| `git status` | Strip "use git..." hint lines |
| `git log` | Keep commit headers, author, date, and message; cap at 80 lines |
| `git diff` | Strip ANSI; cap at 200 lines |
| `git show` | Strip ANSI; cap at 150 lines |
| `git blame` | Truncate lines at 120 chars; cap at 200 lines |

#### Package Managers

| Command | Filter |
|---|---|
| `npm/yarn/pnpm/bun install` | Keep errors, warnings, summary lines; "Install complete." if empty |
| `npm/yarn/pnpm/bun run` | Keep errors, warnings, stack traces; "Script completed." if empty |
| `turbo run` | Keep errors, warnings, cache status; "Turbo run complete." if empty |

#### Test Runners

| Command | Filter |
|---|---|
| `vitest` | "All tests passed." on success; keep failures, errors, stack traces, summary |
| `jest` | "All tests passed." on success; keep failures, errors, stack traces, summary |
| `bun test` | "All tests passed." on success; keep failures, errors, stack traces |
| `tsc` | Keep errors/warnings; "No TypeScript errors." if clean |

#### File Listing

| Command | Filter |
|---|---|
| `ls` | Strip ANSI; cap at 50 lines; "Empty directory." if empty |
| `find` | Strip ANSI; drop permission errors; cap at 100 lines |

## 📁 Project Structure

```
src/
├── index.ts              # Extension entry point
├── pi-hook.ts            # tool_result hook registration
├── filter-engine/        # Core filtering pipeline
│   └── index.ts          # FilterEngine, FilterRegistry, pipeline stages
├── command-registry/     # Built-in filter rules
│   ├── git.ts            # git status/log/diff/show/blame
│   ├── package-manager.ts # npm/yarn/pnpm/bun/turbo
│   ├── test-runner.ts    # vitest/jest/bun test/tsc
│   └── file-listing.ts   # ls/find
├── savings-tracker/      # Per-session and historical savings
├── gain-command/         # /token-saver:gain
├── discover-command/     # /token-saver:discover
└── passthrough-mode/     # /token-saver:passthrough
tests/
└── unit/                 # Unit tests
```

## 🧪 Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Lint & format
bun run lint

# Type check
bun run typecheck

# Build for publish
bun run build
```

Pre-commit hooks (lefthook) run biome, typecheck, and tests.

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) — enforced by commitlint.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit with conventional commits (`git commit -m "feat: add something"`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

## 📜 License

MIT © [MonsieurBarti](https://github.com/MonsieurBarti)

---

<div align="center">
  <sub>Built with ⚡ by <a href="https://github.com/MonsieurBarti">MonsieurBarti</a></sub>
</div>
