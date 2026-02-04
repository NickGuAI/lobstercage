# Lobstercage

Security scanner and live guard for OpenClaw. It audits your config, scans past sessions for PII/policy violations, and can install a guard plugin that blocks risky outgoing messages in real time.

## Quick start

```bash
npx lobstercage catch
```

This runs a full security scan and installs the live guard.

### From source

```bash
npm install
npm run build
./dist/cli.js catch
```

If you want a `lobstercage` command in your PATH:

```bash
npm link
lobstercage catch
```

## Commands

```bash
lobstercage catch [options]   # Full scan: audit + forensic scan + guard install
lobstercage audit [options]   # Config-only audit
```

### `catch` options

- `--scan-only`  Only run the forensic scan (no audit, no guard install)
- `--guard-only` Only install the live guard (no audit, no forensic scan)
- `--audit-only` Only run the config audit (no forensic scan, no guard)
- `--fix`        Auto-fix remediable security issues
- `--interactive` / `-i`  Review and redact PII violations interactively
- `--report <path>` Write a combined report to a file
- `--config <path>` Use a custom OpenClaw config path
- `--uninstall`  Remove the lobstercage guard plugin

### `audit` options

- `--fix`        Auto-fix remediable security issues
- `--deep`       Include deep connectivity checks
- `--report <path>` Write a report to a file
- `--config <path>` Use a custom OpenClaw config path

## Examples

```bash
# Full scan + guard install
npx lobstercage catch

# Full scan + auto-fix
npx lobstercage catch --fix

# Only scan session history
npx lobstercage catch --scan-only

# Config audit only
npx lobstercage audit

# Config audit + auto-fix
npx lobstercage audit --fix

# Uninstall guard plugin
npx lobstercage catch --uninstall

# Use custom OpenClaw location
OPENCLAW_STATE_DIR=~/my-openclaw npx lobstercage catch
```

## What gets scanned

- **Config audit**: Reads your OpenClaw config file and checks security settings.
- **Forensic scan**: Scans assistant messages in session JSONL files for PII and prompt-injection patterns.
- **Live guard**: Installs a plugin that blocks outgoing messages containing detected PII or injection patterns.

## Paths and configuration

### Default locations

By default, Lobstercage uses `~/.openclaw` as the OpenClaw state directory:

| Component | Default Path |
|-----------|--------------|
| Config | `~/.openclaw/config.json` |
| Sessions | `~/.openclaw/agents/*/sessions/*.jsonl` |
| Guard plugin | `~/.openclaw/extensions/lobstercage/` |
| Credentials | `~/.openclaw/credentials/` |

### Custom state directory

If OpenClaw is installed in a non-standard location, set one of these environment variables:

```bash
export OPENCLAW_STATE_DIR=/path/to/your/openclaw

# Or the legacy variable name:
export CLAWDBOT_STATE_DIR=/path/to/your/openclaw
```

All Lobstercage operations (config audit, forensic scan, guard install) will use this directory.

### Config search order

If you do not pass `--config`, Lobstercage searches these locations in order:

1. `$OPENCLAW_STATE_DIR/config.json` (if env var is set)
2. `~/.openclaw/config.json`
3. `~/.openclaw/config.json5`
4. `~/.openclaw/config.jsonc`
5. `~/.openclaw/openclaw.json`
6. `./openclaw.json` (current directory)
7. `./.openclaw.json` (current directory)

### Guard plugin

The guard plugin is installed to `{stateDir}/extensions/lobstercage/` and provides three layers of protection:

| Hook | Function |
|------|----------|
| `before_agent_start` | Injects a security directive instructing the AI not to output PII |
| `message_sending` | Blocks outgoing messages containing detected PII (SSN, credit cards, API keys) |
| `agent_end` | Logs any violations that slip through for auditing |

## Auto-fix behavior

- `--fix` rewrites your config as pretty-printed JSON. Comments and trailing commas from JSON5/JSONC configs will be removed.
- Some findings are informational and cannot be auto-fixed.

## Interactive redaction

When `--interactive` is enabled, you can review violations and apply redactions to session files. Lobstercage creates a backup of each file before modifying it.

## Development

```bash
npm run build
npm run test
```
