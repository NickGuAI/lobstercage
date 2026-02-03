# Lobstercage v2: Unified Security Scanner for OpenClaw

## Recent Progress (v0.1.0)

### ✅ Completed
- **Fixed session parsing** — Now correctly reads OpenClaw's nested JSONL format (`type: "message"` with `message.role` instead of top-level `role`)
- **Redesigned terminal UI**:
  - Replaced heavy ASCII banner with minimal Matrix flow animation (Katakana rain effect)
  - Added `Spinner` component for cleaner loading states
  - Tree-style report grouped by rule → session file → message
  - Simplified style helpers (`green`, `bright`, `dim`, `muted`, `warn`, `error`)
- **Session file links** — Violations show the session file path (`~/.openclaw/agents/main/sessions/...`) and message index
- **Live guard working** — Installs to `~/.openclaw/extensions/lobstercage` and hooks into `message_sending`

### Current Output
```
  LOBSTERCAGE
  Security Scanner for OpenClaw

✓ Scan complete

  1 sessions · 67 messages scanned

  ⚠ 5 violations found

  ● pii-phone (BLOCK) × 4
     └─ ~/.openclaw/agents/main/sessions/58fb1737-...jsonl
         ├─ msg #7: +1********61
         ├─ msg #38: +1********61
         └─ ...and 2 more

  ● pii-password (BLOCK) × 1
     └─ ~/.openclaw/agents/main/sessions/58fb1737-...jsonl
         └─ msg #7: To*****************************.`

✓ Guard installed
  Outgoing messages will be scanned in real-time
```

---

## Summary of Current State

### lobstercage (current)
- Scans session JSONL logs for PII (phone, email, SSN, credit card, API keys, passwords)
- Scans for content issues (prompt injection, exfiltration attempts)
- Installs a live guard plugin (wired into OpenClaw's `message_sending` hook)
- Minimal Matrix-themed UI with spinner and grouped report

### OpenClaw's Built-in Security Audit
Located in `openclaw/src/security/audit.ts` and `audit-extra.ts`, already has 30+ security checks:
- Gateway auth (bind settings, token/password, Tailscale exposure)
- File permissions (state dir, config, credentials, auth-profiles.json)
- Channel security (allowlists, DM policies, group policies per channel)
- Browser control (remote CDP)
- Logging redaction
- Elevated tools access
- Hooks hardening  
- Model hygiene (legacy/weak/small models)
- Plugin trust
- Secrets in config

---

## Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           LOBSTERCAGE v2 PLAN                             │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Current Architecture (v0.1.0):                                           │
│  ──────────────────────────────                                           │
│                                                                           │
│    lobstercage catch                                                      │
│         │                                                                 │
│         ├─► Matrix flow animation (1.2s)                                  │
│         │                                                                 │
│         ├─► Phase 1: Forensic Scan                                        │
│         │     └─► Scan ~/.openclaw/agents/*/sessions/*.jsonl              │
│         │     └─► Detect PII + injection in assistant messages            │
│         │     └─► Report grouped by rule → file → message                 │
│         │                                                                 │
│         └─► Phase 2: Install Live Guard                                   │
│               └─► Write plugin to ~/.openclaw/extensions/lobstercage      │
│               └─► Hook into message_sending for real-time filtering       │
│                                                                           │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Proposed Architecture (v2):                                              │
│  ──────────────────────────                                               │
│                                                                           │
│    lobstercage catch [--deep] [--fix]                                     │
│         │                                                                 │
│         ├─► Phase 1: Config Security Audit (NEW)                          │
│         │     │                                                           │
│         │     ├─► Gateway Auth Settings                                   │
│         │     │     • Is auth configured when bound beyond loopback?      │
│         │     │     • Is token length sufficient?                         │
│         │     │     • Tailscale exposure warnings                         │
│         │     │     • Control UI insecure auth flags                      │
│         │     │                                                           │
│         │     ├─► Channel Access Control                                  │
│         │     │     • DM policies (open/disabled/allowlist)               │
│         │     │     • Group policies per channel                          │
│         │     │     • Wildcard allowlists                                 │
│         │     │     • Missing sender allowlists                           │
│         │     │                                                           │
│         │     ├─► Filesystem Permissions                                  │
│         │     │     • State dir permissions (700)                         │
│         │     │     • Config file permissions (600)                       │
│         │     │     • Credentials dir (auth-profiles.json)                │
│         │     │     • Session store permissions                           │
│         │     │     • Symlink warnings                                    │
│         │     │     • Synced folder detection (iCloud/Dropbox/etc)        │
│         │     │                                                           │
│         │     ├─► Tool & Model Risk                                       │
│         │     │     • Elevated tools with wildcard access                 │
│         │     │     • Legacy/weak/small models                            │
│         │     │     • Dangerous web tool exposure                         │
│         │     │                                                           │
│         │     ├─► Plugin Trust                                            │
│         │     │     • Extensions without plugins.allow                    │
│         │     │     • Untrusted plugin sources                            │
│         │     │                                                           │
│         │     └─► Secrets Hygiene                                         │
│         │           • Passwords in config (prefer env vars)               │
│         │           • Token reuse between gateway/hooks                   │
│         │           • Logging redaction disabled                          │
│         │                                                                 │
│         ├─► Phase 2: Forensic Session Scan (DONE ✓)                       │
│         │     └─► PII/injection/exfiltration in assistant messages        │
│         │                                                                 │
│         ├─► Phase 3: Auto-Fix (--fix flag)                                │
│         │     │                                                           │
│         │     ├─► Fix file permissions (chmod 700/600)                    │
│         │     ├─► Flip groupPolicy "open" → "allowlist"                   │
│         │     ├─► Enable logging.redactSensitive                          │
│         │     └─► Write remediation script                                │
│         │                                                                 │
│         └─► Phase 4: Install Live Guard (DONE ✓)                          │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Commands

### Current (v0.1.0)
```
lobstercage catch                 # Forensic scan + install guard
lobstercage catch --scan-only     # Scan only, no guard install
lobstercage catch --guard-only    # Install guard only, no scan
lobstercage catch --report FILE   # Write report to file
lobstercage catch --uninstall     # Remove the guard plugin
```

### Planned (v2)
```
lobstercage audit                 # Config-only security audit
lobstercage audit --fix           # Audit + auto-remediate
lobstercage audit --deep          # Include gateway connectivity probe
lobstercage catch                 # Full scan (audit + forensic + guard)
```

---

## Integration Strategy

### Option A: Import OpenClaw's audit directly
- lobstercage imports from `openclaw/src/security/audit.ts`
- Reuses `SecurityAuditFinding` type and `runSecurityAudit()`
- Adds lobstercage-specific presentation layer
- **Pros:** No code duplication, stays in sync
- **Cons:** Couples lobstercage to openclaw internals

### Option B: Shell out to `openclaw security audit`
- lobstercage runs `openclaw security audit --json`
- Parses JSON output, presents unified report
- **Pros:** Decoupled, uses stable CLI interface
- **Cons:** Requires openclaw installed, less control

### Option C: Copy audit logic into lobstercage (recommended)
- Implement parallel config-audit module in lobstercage
- Use openclaw's audit as reference, adapted for lobstercage UX
- **Pros:** Standalone tool, custom presentation
- **Cons:** Some logic duplication

---

## Output Format Example (v2)

```
  LOBSTERCAGE
  Security Scanner for OpenClaw

✓ Scan complete

  1 sessions · 67 messages scanned

─────────────────────────────────────────
  CONFIG AUDIT
─────────────────────────────────────────

  ● CRITICAL
     └─ Gateway binds beyond loopback without auth
         gateway.bind="0.0.0.0" but no token/password set
         Fix: Set OPENCLAW_GATEWAY_TOKEN or gateway.auth.token

     └─ WhatsApp DMs are open
         channels.whatsapp.dm.policy="open"
         Fix: Use allowlist + pairing

  ⚠ WARNING
     └─ State dir is group-readable
         Fix: chmod 700 ~/.openclaw

     └─ Gateway token looks short (12 chars)
         Fix: Use a 32+ character random token

─────────────────────────────────────────
  FORENSIC SCAN
─────────────────────────────────────────

  ⚠ 5 violations found

  ● pii-phone (BLOCK) × 4
     └─ ~/.openclaw/agents/main/sessions/58fb1737-...jsonl
         ├─ msg #7: +1********61
         └─ ...and 3 more

  ● pii-password (BLOCK) × 1
     └─ ~/.openclaw/agents/main/sessions/58fb1737-...jsonl
         └─ msg #7: To*****************************.`

─────────────────────────────────────────

Summary: 2 critical, 2 warnings, 5 forensic violations
Run `lobstercage catch --fix` to auto-remediate
```

---

## Implementation Tasks

| Phase | Task | Status | Files |
|-------|------|--------|-------|
| **0** | Fix session JSONL parsing | ✅ Done | `forensic/scan.ts` |
| **0** | Redesign terminal UI | ✅ Done | `ui/matrix.ts`, `ui/report.ts` |
| **0** | Add session file paths to report | ✅ Done | `ui/report.ts` |
| **0** | Live guard plugin | ✅ Done | `guard/plugin.ts`, `guard/install.ts` |
| **1** | Define audit types | Todo | `audit/types.ts` |
| **2** | Config loader (read OpenClaw config) | Todo | `audit/config-loader.ts` |
| **3** | Gateway security checks | Todo | `audit/checks/gateway.ts` |
| **4** | Channel access control checks | Todo | `audit/checks/channels.ts` |
| **5** | Filesystem permission checks | Todo | `audit/checks/filesystem.ts` |
| **6** | Tool & model risk checks | Todo | `audit/checks/tools.ts` |
| **7** | Secrets hygiene checks | Todo | `audit/checks/secrets.ts` |
| **8** | Audit runner (orchestrates all checks) | Todo | `audit/runner.ts` |
| **9** | Auto-fix logic | Todo | `audit/fix.ts` |
| **10** | New `audit` CLI command | Todo | `commands/audit.ts` |
| **11** | Update `catch` to include audit phase | Todo | `commands/catch.ts` |
| **12** | Unified report (audit + forensic) | Todo | `ui/report.ts` |
| **13** | Tests | Todo | `audit/*.test.ts` |

---

## Key Security Checks to Implement

Based on OpenClaw's existing audit and authentication layers:

### 1. Gateway Authentication
- `gateway.bind` beyond loopback requires auth
- Token length ≥ 24 chars
- Tailscale Funnel exposure warning
- Control UI insecure auth flags (`allowInsecureAuth`, `dangerouslyDisableDeviceAuth`)

### 2. Channel Access Control
Covers: WhatsApp, Telegram, Discord, Slack, Signal, iMessage, MS Teams, Matrix

- DM policy `open` = critical
- Group policy `open` + elevated tools = critical
- Wildcard `*` in allowlists = critical
- Missing sender allowlists for slash commands
- Session scope isolation (`dmScope` settings)

### 3. Pairing & Allowlists
- Check `~/.openclaw/credentials/<channel>-allowFrom.json` exists
- Warn if allowlist is empty but channel is configured
- Check pairing store for stale entries

### 4. Filesystem Security
- State dir (`~/.openclaw`) mode 700
- Config file mode 600
- Auth profiles (`auth-profiles.json`) mode 600
- Credentials directory mode 700
- Symlink detection (extra trust boundary)
- Synced folder detection (iCloud/Dropbox/OneDrive/Google Drive)

### 5. Model & Tool Risks
- Small models (<300B params) + web tools = critical
- Legacy models (GPT-3.5, Claude 2/Instant)
- Weak tier models (Haiku, below GPT-5, below Claude 4.5)
- Elevated tools with wildcard `allowFrom`
- Open groups with elevated tools enabled

### 6. Secrets Hygiene
- Passwords stored in config files (prefer env vars)
- Token reuse between gateway and hooks
- Logging redaction disabled (`logging.redactSensitive="off"`)
- Hooks token too short

### 7. Plugin Trust
- Extensions exist but `plugins.allow` not set
- Unpinned/unallowlisted extensions with skill commands enabled

### 8. Browser Control
- Remote CDP over HTTP (not HTTPS/tailnet)
- Browser enabled without proper network isolation

---

## OpenClaw Session Storage Reference

Sessions are stored at `~/.openclaw/agents/<agentId>/sessions/`:
- `sessions.json` — Index mapping session keys to session files
- `<uuid>.jsonl` — Session transcript in JSONL format

### Session JSONL Format
```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"..."}
{"type":"message","id":"...","message":{"role":"user","content":[...]}}
{"type":"message","id":"...","message":{"role":"assistant","content":[...]}}
```

Key insight: Messages are nested under `entry.message.role`, not `entry.role`.

### Session Lifecycle
- Sessions persist across server restarts
- One session per sender identity (not per conversation)
- `/new` or `/reset` command forks to a new session file

---

## OpenClaw Authentication Layers Reference

From `analysis.md` - OpenClaw has these auth layers that lobstercage should verify:

1. **Model Provider Authentication**
   - API keys stored in `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`
   - OAuth tokens with auto-refresh
   - 0600 permissions required

2. **Gateway Authentication**
   - Token mode (`OPENCLAW_GATEWAY_TOKEN` or `gateway.auth.token`)
   - Password mode (`OPENCLAW_GATEWAY_PASSWORD` or `gateway.auth.password`)
   - Tailscale mode (identity via proxy headers + whois)
   - Loopback exemption (localhost bypasses auth)

3. **DM Channel Access Control**
   - Pairing codes (8-char, 1-hour validity)
   - Per-channel allowlists in `~/.openclaw/credentials/<channel>-allowFrom.json`
   - DM policies: `open` | `disabled` | `allowlist`

4. **Group Policy**
   - `open` - anyone can trigger (mention required)
   - `disabled` - all group messages blocked
   - `allowlist` - only approved senders

5. **Device Pairing**
   - Mobile devices authenticate via pairing flow
   - Stored in `~/.openclaw/devices/paired.json`

---

## File Structure (Current + Planned)

```
lobstercage/src/
├── audit/                    # NEW - Config security audit
│   ├── types.ts              # SecurityFinding, Severity types
│   ├── config-loader.ts      # Load OpenClaw config (JSON5)
│   ├── runner.ts             # Orchestrate all checks
│   ├── fix.ts                # Auto-remediation logic
│   └── checks/
│       ├── gateway.ts        # Gateway auth checks
│       ├── channels.ts       # Channel access control
│       ├── filesystem.ts     # File permission checks
│       ├── tools.ts          # Tool & model risk
│       ├── secrets.ts        # Secrets hygiene
│       └── plugins.ts        # Plugin trust
├── commands/
│   ├── catch.ts              # ✅ Main command (forensic + guard)
│   └── audit.ts              # NEW - Standalone audit command
├── forensic/
│   ├── discover.ts           # ✅ Find session files
│   ├── scan.ts               # ✅ Parse + scan sessions
│   └── report.ts             # ✅ Build scan report
├── guard/
│   ├── plugin.ts             # ✅ Live guard plugin source
│   └── install.ts            # ✅ Plugin installation
├── scanner/
│   ├── engine.ts             # ✅ PII + content rule engine
│   ├── types.ts              # ✅ Rule/violation types
│   └── rules/
│       ├── pii.ts            # ✅ PII detection patterns
│       └── content.ts        # ✅ Content policy patterns
└── ui/
    ├── matrix.ts             # ✅ Matrix animation + spinner
    └── report.ts             # ✅ Grouped violation report
```

---

## Success Criteria

### v0.1.0 (Current) ✅
1. ✅ Correctly parses OpenClaw session JSONL format
2. ✅ Scans assistant messages for PII/content violations
3. ✅ Clean terminal UI with Matrix animation
4. ✅ Grouped report showing file paths and message indices
5. ✅ Live guard plugin installs and hooks into message_sending

### v2 (Planned)
1. `lobstercage audit` produces a comprehensive config security report
2. All critical OpenClaw security settings are checked
3. Actionable remediation commands are provided for each finding
4. `--fix` flag auto-remediates filesystem and config issues
5. Unified report combines config audit + forensic scan results
6. Works standalone without requiring openclaw to be running
