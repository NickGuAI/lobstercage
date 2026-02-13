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
lobstercage catch [options]                 # Full pipeline: audit -> skill scan -> integrity -> forensic -> guard
lobstercage audit [options]                 # Config-only audit
lobstercage status [options]                # Show stats and open web dashboard
lobstercage install-safe <source> [options] # Safe install workflow with pre/post scanner gating
lobstercage scan-skills [options]           # Scan installed skills and quarantine suspicious ones
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

### `status` options

- `--json`       Output stats as JSON
- `--dashboard`  Open the web dashboard
- `--port <n>`   Dashboard port (default: 8888)
- `--days <n>`   Stats for last N days (default: 7)

### `install-safe` options

- `--enable` Enable skill only after clean pre/post external scan results

### `scan-skills` options

- `--quarantine` Move flagged skills into quarantine
- `--restore <id>` Restore a quarantined skill by id or skill name
- `--json` Output result as JSON

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

# Safe install a skill and auto-enable only on clean scans
npx lobstercage install-safe ~/Downloads/my-skill --enable

# Scan installed skills and quarantine suspicious ones
npx lobstercage scan-skills --quarantine

# Restore quarantined skill
npx lobstercage scan-skills --restore <quarantine-id>

# Use custom OpenClaw location
OPENCLAW_STATE_DIR=~/my-openclaw npx lobstercage catch

# Show scan statistics
npx lobstercage status

# Show stats as JSON
npx lobstercage status --json

# Show stats for last 30 days
npx lobstercage status --days 30

# Open web dashboard
npx lobstercage status --dashboard

# Dashboard on custom port
npx lobstercage status --dashboard --port 9000
```

## What gets scanned

- **Config audit**: Reads your OpenClaw config file and checks security settings.
- **Skill scan**: Scans installed skills/extensions for staged-delivery malware patterns.
- **Integrity drift**: Compares extension file hashes against a stored baseline.
- **Forensic scan**: Scans assistant messages in session JSONL files for PII and prompt-injection patterns.
- **Live guard**: Installs a plugin that blocks outgoing messages containing detected PII, injection, or malware execution patterns.

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
| `message_sending` | Blocks outgoing messages containing detected PII, malware execution, or injection payloads |
| `agent_end` | Logs any violations that slip through for auditing |

## Auto-fix behavior

- `--fix` rewrites your config as pretty-printed JSON. Comments and trailing commas from JSON5/JSONC configs will be removed.
- Some findings are informational and cannot be auto-fixed.

## Interactive redaction

When `--interactive` is enabled, you can review violations and apply redactions to session files. Lobstercage creates a backup of each file before modifying it.

## Web Dashboard

The `--dashboard` flag launches a Matrix-themed web dashboard with:

- **Pixel art lobster animation** - The lobster walks during scans and snaps its claws when violations are found
- **Scan statistics** - Total scans, violations, and trends over time (7/30/90 day views)
- **Top triggered rules** - See which rules catch the most violations
- **Action buttons**:
  - **RUN SCAN** - Trigger a forensic scan of session history
  - **AUDIT** - Run a security audit of your config
  - **AUTO-FIX** - Apply automatic fixes to remediable issues
- **Rule configuration** - Enable/disable rules and change action levels (warn/block/shutdown)
- **Custom rules** - Add your own pattern-based rules

### Accessing the dashboard remotely

The dashboard binds to `localhost` only for security. To access it from a remote machine:

**SSH port forwarding:**
```bash
ssh -L 8888:localhost:8888 user@remote-host
# Then open http://localhost:8888 in your local browser
```

**Cursor/VS Code Remote-SSH:**
1. Connect to the remote host
2. Run `lobstercage status --dashboard`
3. Open the Ports panel and forward port 8888
4. Click "Open in Browser"

### Stats storage

Scan statistics are stored in `~/.openclaw/lobstercage/stats.json` and include:

- Scan events with timestamps and violation counts
- Skill scan and integrity drift events
- Daily summaries for trend analysis
- Rule configuration overrides

Stats are automatically pruned after 90 days.

## Development

```bash
npm run build
npm run test
```
