# Lobstercage

Security scanner and live guard for OpenClaw. It audits your config, scans past sessions for PII/policy violations, and can install a guard plugin that blocks risky outgoing messages in real time.

## Quick start (from source)

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
lobstercage catch

# Full scan + auto-fix
lobstercage catch --fix

# Only scan session history
lobstercage catch --scan-only

# Config audit only
lobstercage audit

# Config audit + auto-fix
lobstercage audit --fix

# Uninstall guard plugin
lobstercage catch --uninstall
```

## What gets scanned

- **Config audit**: Reads your OpenClaw config file and checks security settings.
- **Forensic scan**: Scans assistant messages in session JSONL files for PII and prompt-injection patterns.
- **Live guard**: Installs a plugin that blocks outgoing messages containing detected PII or injection patterns.

## Paths and configuration

### Config search order

If you do not pass `--config`, Lobstercage searches these locations in order:

- `~/.openclaw/config.json`
- `~/.openclaw/config.json5`
- `~/.openclaw/config.jsonc`
- `~/.openclaw/openclaw.json`
- `./openclaw.json`
- `./.openclaw.json`

You can override the OpenClaw state directory with:

- `OPENCLAW_STATE_DIR`
- `CLAWDBOT_STATE_DIR`

This affects where configs and extensions are loaded from.

### Forensic scan location

Session scans currently look in:

- `~/.openclaw/agents/*/sessions/*.jsonl`

(There is no state-dir override for forensic scans at the moment.)

### Guard plugin location

The guard plugin is installed to:

- `~/.openclaw/extensions/lobstercage`

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
