# GehirnRepo = Monorepo for all projects

## Key Directories

All operational assets live under `operations/`.

### `operations/sops/` — Standard Operating Procedures
Step-by-step runbooks for operational tasks (setup, debugging, restarts).
- **Read before acting** — check if an SOP exists before improvising
- **Follow in order** — SOPs are numbered; dependencies matter
- **Scripts live in `operations/sops/scripts/`** — run those, don't re-implement
- See `operations/sops/README.md` for the full index

### `operations/logs/` — Operation Logs
Append-only logs of actions taken on the system.
- Create a **date folder** (`YYYY-MM-DD`) for each operating day
- Append entries to a `.jsonl` file inside that folder
- Each entry = one action taken (what, why, result)

### `operations/scripts/` — Launch & Setup Scripts
App launch scripts and infrastructure setup helpers.

### `operations/infra/` — Infrastructure Config
Credentials and cloud provider configs (GCP, etc.).

## Package Managers

All projects in this monorepo use these package managers:

- **Python: `uv`** — fast, Rust-based replacement for pip/pip-tools/virtualenv/pyenv
- **Node.js: `pnpm`** — content-addressable store, strict `node_modules`, faster than npm

Do NOT use `pip`, `npm`, or `yarn` for new projects.

## Skills

**NEVER create a SKILL.md without a corresponding .sh script.**

- Every skill MUST have an executable script (e.g., `commit.sh`, `deploy.sh`)
- SKILL.md documents the script, it does NOT replace it
- The script does the work, Claude runs the script

## Instructions

**ALWAYS FOLLOW YOUR GUIDING PRINCIPLES - `SIMPLE`**.

### Check Operations First

**Before answering ANY infrastructure, networking, deployment, or service question**, scan `operations/` for existing context:
1. Check `operations/sops/` for relevant SOPs (ALB, DNS, certs, ports, services)
2. Check `operations/scripts/` for existing automation
3. Check `operations/logs/` for recent actions

The answer is probably already documented. Don't guess — read.

### Guiding Principles - SIMPLE

- S: Simplicity is preferred at all times.
  - Short docs
  - Short comments
  - Simple solutions
  - Simple but crucial logs.
- I: Investigate and research solutions before implement.
- M: Maintainability is not an after thought.
  - Code must be easy to read
  - Directory structure must be simple and clear
- P: Purpose Driven Development
  - Start with the purpose of the request
  - Develop corresponding test
  - Write and iterate on code until test passes without changing test code.
- E: Explain your decisions, always.
  - Explain the rootcause before suggesting solutions.
  - Explain the solution before implementation.

### Take Notes

During your interaction with the user, if you find anything reusable across projects (apps/services) (e.g. version of a library, model name), especially about a fix to a mistake you made or a correction you received, you should take note in the 'CLAUDE learned' of the `Lessons` section in the `CLAUDE.md` file so you will not make the same mistake again. 

### Consult Your Peers

1. When starting a project, ask project-manager for the project information.
2. If you are stuck, stop and ask for tech lead input (human).

### Dependency Boundaries

**NEVER edit dependency source files without explicit permission.** This includes:
- Cloned repos (e.g. gogcli, any `git clone`'d project)
- `node_modules/`, Go modules, pip packages
- Any upstream tool or library source code

If a dependency is missing a feature, propose the fix to the user first. Do not patch, fork, or modify dependency code on your own.

### Extreme Ownership

**Every issue you see is your problem.** No exceptions.

- Pre-existing lint errors? Fix them.
- Flaky tests? Fix them.
- Outdated docs? Update them.
- Technical debt? Address it.

Don't leave the codebase worse than you found it. If you touch a file, clean it up. If you see a warning, resolve it. Own everything.

### Stop and Check
**Stop and validate** at these moments:
- After implementing a complete feature
- Before starting a new major component  
- When something feels wrong
- Before declaring "done"
- **WHEN HOOKS FAIL WITH ERRORS** ❌

Run: `make fmt && make test && make lint`

> Why: You can lose track of what's actually working. These checkpoints prevent cascading failures.

# Lessons

## CLAUDE Learned

### Testing Discipline
- Always run project tests for every change; use each project's verification SOP scripts when available.

### Path Resolution in Python
- When resolving paths relative to current file, use `Path(__file__).resolve().parent` pattern
- For sibling directories: `current_file.parent.parent / "config"` is cleaner than complex join operations
- Always use Path.resolve() to get absolute paths before navigation

### Streamlit UI Best Practices
- Empty checkbox labels cause accessibility warnings
- Use `label_visibility="collapsed"` to hide labels while maintaining accessibility
- Session state should be initialized early with default values
- Auto-loading data on first run improves user experience

### Claude Code SDK Permission Modes
- Permission modes are: `default`, `acceptEdits`, `bypassPermissions` (plan is not supported)
- Permission mode overrides HIL hooks when specified
- Reference SDK documentation for exact parameter values
- **CRITICAL**: `allowed_tools` must be an explicit list of tool names, NOT `["*"]`
- **SIMPLE FIX**: Omit `allowed_tools` parameter when MCPs are enabled to allow all available tools
- MCP tools follow pattern: `mcp__{server}__{tool_name}` (e.g., `mcp__Notion__notion-search`)

### Claude Agent SDK Auth (Deployments)
- Deployed services do not have local Claude Code login state; SDK expects env auth.
- Set `ANTHROPIC_API_KEY` (preferred) or `CLAUDE_CODE_OAUTH_TOKEN` on the server.

### SIMPLE Principle Violations to Avoid
- **Don't hardcode dynamic lists** - MCP tools should be discovered at runtime, not hardcoded
- **Investigate before implementing** - Test assumptions about SDK behavior first
- **Ask clarifying questions** - When user reports "X keeps happening", understand root cause before fixing
- **Maintain simplicity** - If solution requires 60+ hardcoded strings, it's probably wrong
- **Purpose first** - Address the specific need (MCP permissions) not general solutions (all permissions)

### MCP (Model Context Protocol) Configuration
- MCP configs stored as YAML files with transport details
- Each MCP should have descriptive name matching its purpose (e.g., gmail_mcp not relay)
- Tool patterns define which tools the MCP handles (e.g., `find.*` for search operations)
- MCPs can be dynamically enabled/disabled via config

### Prisma Client in Browser Bundles
- Avoid importing `@prisma/client` (or modules that import it) in client code
- Move shared types/constants to a browser-safe module to prevent `module is not defined` runtime errors

### Prisma Client in the Browser
- Importing `@prisma/client` in Vite/React code bundles Prisma for the browser and throws `module is not defined`
- Use `import type` or shared string unions instead of runtime Prisma enums in client code

### Unicode Regex in JavaScript
- Always use the `u` flag on regexes that process user text containing emoji or non-BMP characters
- Without `/u`, JS regex operates on UTF-16 code units; surrogate pairs are split and encode as U+FFFD replacement characters
- Example: `/[^\x20-\x7e]/g` breaks emoji; `/[^\x20-\x7e]/gu` handles them correctly

### Infrastructure Context — Check Before Answering
- **ALWAYS check `operations/sops/` before answering infra questions** (TLS, ports, ALB, DNS, certs)
- This repo uses a shared ALB with `*.gehirn.ai` wildcard ACM cert — TLS terminates at the ALB, not on EC2
- Services bind plain HTTP on EC2; the ALB handles HTTPS. Never suggest self-signed certs or EC2-level TLS.
- Port registry and service routing are documented in SOP-12

### Spawning Subagents — Use tmux, Not Background Processes
- Always spawn Claude subagents in **tmux sessions**, never as `nohup ... &` background processes
- Name sessions descriptively (e.g., `gtm-seo-01`, `research-auth`)
- tmux sessions are trackable (`tmux ls`), attachable (`tmux attach -t name`), and killable (`tmux kill-session -t name`)
- Pipe output through `tee` to keep log files alongside the live session
- This matches existing server patterns (`server-gehirn`, `server-legion`)

### electron-builder Notarization
- `"notarize": true` does NOT read `APPLE_TEAM_ID` from env — electron-builder passes `teamId: undefined` to `@electron/notarize`
- `teamId` MUST be in the `notarize` object in `package.json`: `"notarize": { "teamId": "..." }`
- Apple Team IDs are public (embedded in codesigning certs), not secrets — safe to commit

