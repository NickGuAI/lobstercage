# Lobstercage: Future Improvements

## Current State (v0.1.2)

Lobstercage now provides:
- ✅ Config audit with 30+ security checks across 8 categories
- ✅ Forensic scanning of session history for PII violations
- ✅ Interactive redaction with backups
- ✅ Auto-fix for many security issues
- ✅ Live guard plugin with 3 protection layers:
  - `before_agent_start` — Injects security directive
  - `message_sending` — Blocks outgoing messages with PII
  - `agent_end` — Logs violations for auditing
- ✅ `npx lobstercage catch` works
- ✅ Respects `OPENCLAW_STATE_DIR` environment variable

---

## Potential Improvements

### 1. Webhook/Alerting for PII Leaks

**Problem:** The `agent_end` hook logs violations but doesn't notify you when PII slips through.

**Solution:** Add configurable alerting when violations are detected:
- Slack webhook
- Discord webhook
- Email (via SMTP or SendGrid)
- Generic HTTP webhook
- Desktop notification (native)

**Implementation:**
```typescript
// ~/.openclaw/lobstercage.config.json
{
  "alerts": {
    "slack": { "webhookUrl": "https://hooks.slack.com/..." },
    "discord": { "webhookUrl": "https://discord.com/api/webhooks/..." },
    "http": { "url": "https://your-server.com/alert", "method": "POST" }
  },
  "alertOn": ["pii-ssn", "pii-credit-card", "content-injection"]
}
```

**Files to modify:**
- `src/guard/plugin.ts` — Add alert dispatch in `agent_end` hook
- `src/guard/alerts.ts` — New file for webhook dispatch logic
- `src/guard/config.ts` — New file for lobstercage-specific config

**Priority:** High — This is the main gap in detection-to-response

---

### 2. User-Configurable Rules

**Problem:** The PII patterns are hardcoded. Users may need custom patterns for:
- Internal ID formats
- Custom API key prefixes
- Industry-specific sensitive data (HIPAA, PCI, etc.)

**Solution:** Allow custom rules via config file:
```typescript
// ~/.openclaw/lobstercage.config.json
{
  "customRules": [
    {
      "id": "internal-employee-id",
      "pattern": "EMP-\\d{6}",
      "action": "block",
      "description": "Internal employee ID"
    },
    {
      "id": "medical-record",
      "pattern": "MRN[:\\s]*\\d{8,}",
      "action": "shutdown",
      "description": "Medical record number"
    }
  ],
  "disabledRules": ["pii-phone"]  // Opt-out of built-in rules
}
```

**Files to modify:**
- `src/scanner/engine.ts` — Load custom rules from config
- `src/guard/plugin.ts` — Include custom rules in runtime scanning
- `src/commands/catch.ts` — `loadRules()` function already has a placeholder for this

**Priority:** Medium — Many users will need custom patterns

---

### 3. Pre-Response Blocking (if supported by OpenClaw)

**Problem:** The `agent_end` hook fires **after** the response is delivered. We can only log, not block.

**Investigation needed:** Does OpenClaw support a hook that fires **before** the response is shown to the user? Possible hooks to explore:
- `before_response` or `response_sending`
- `agent_response` with cancel capability

**If available:**
```typescript
api.on("before_response", (event, ctx) => {
  const violations = scanContent(event.content);
  if (violations.some(v => v.action === "shutdown")) {
    return { 
      cancel: true,
      replacement: "I cannot complete this request due to security policy."
    };
  }
});
```

**Priority:** High — This would close the detection gap entirely

---

### 4. Enhanced Prompt Injection Detection

**Problem:** Current injection patterns only catch basic "ignore previous instructions" variants.

**Expand patterns to detect:**
```typescript
const INJECTION_PATTERNS = [
  // Current
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /disregard\s+(all\s+)?(prior|previous|above)\s+(instructions|rules)/gi,
  
  // Add these
  /system\s*prompt/gi,
  /you\s+are\s+now\s+/gi,
  /pretend\s+you\s+are/gi,
  /act\s+as\s+if/gi,
  /forget\s+(everything|all|your)\s+(you|rules|instructions)/gi,
  /new\s+instructions?:/gi,
  /override\s+(your|the)\s+(rules|instructions|guidelines)/gi,
  /jailbreak/gi,
  /DAN\s*mode/gi,
  /developer\s*mode/gi,
  /\[INST\]/gi,  // LLaMA format injection
  /<<SYS>>/gi,   // LLaMA format injection
  
  // Exfiltration via markdown
  /!\[.*?\]\(https?:\/\/[^)]*\$\{/gi,  // Variable interpolation in URLs
  /!\[.*?\]\(https?:\/\/[^)]*\{\{/gi,  // Template injection in URLs
];
```

**Files to modify:**
- `src/scanner/rules/content.ts`
- `src/guard/plugin.ts` — Update inline patterns

**Priority:** Medium — Defense in depth

---

### 5. Rate Limiting / Anomaly Detection

**Problem:** No detection for abuse patterns like:
- Sudden spike in message volume
- Rapid-fire requests from unknown senders
- Large responses that might indicate data dumps

**Solution:** Track metrics and alert on anomalies:
```typescript
// In the guard plugin
const metrics = {
  messagesPerMinute: new Map<string, number>(),
  avgResponseLength: 0,
};

api.on("agent_end", (event, ctx) => {
  const senderId = ctx.accountId || ctx.channelId;
  
  // Track rate
  const count = (metrics.messagesPerMinute.get(senderId) || 0) + 1;
  metrics.messagesPerMinute.set(senderId, count);
  
  // Alert if unusual
  if (count > 30) {  // >30 msgs/min
    alert("Rate limit exceeded", { senderId, count });
  }
  
  // Check response size
  const contentLength = extractTextContent(event.messages).length;
  if (contentLength > 10000) {  // >10KB response
    alert("Large response detected", { length: contentLength });
  }
});
```

**Priority:** Low — Nice to have for enterprise users

---

### 6. Audit Report Export Formats

**Problem:** Reports are only in plain text format.

**Solution:** Add structured export formats:
- JSON (machine-readable)
- SARIF (GitHub Security compatible)
- HTML (shareable report)
- CSV (spreadsheet import)

```bash
npx lobstercage catch --report report.json --format json
npx lobstercage audit --report findings.sarif --format sarif
```

**Files to modify:**
- `src/ui/report.ts` — Add format handlers
- `src/commands/catch.ts` — Add `--format` flag

**Priority:** Low — Useful for CI/CD integration

---

### 7. CI/CD Integration

**Problem:** No easy way to run lobstercage in pipelines.

**Solution:** Add a `--ci` flag that:
- Disables animations
- Outputs machine-readable format
- Exits with non-zero code on critical findings

```bash
# In GitHub Actions / GitLab CI
npx lobstercage audit --ci --fail-on critical
```

**Implementation:**
```typescript
if (options.ci) {
  // Skip matrix animation
  // Use JSON output
  // Exit 1 if findings match --fail-on threshold
  process.exit(hasCritical ? 1 : 0);
}
```

**Priority:** Medium — Important for teams

---

### 8. Guard Status Dashboard

**Problem:** No way to see if the guard is active or what it has blocked.

**Solution:** Add status command and optional web dashboard:
```bash
npx lobstercage status
# Output:
# Guard: ✓ Installed
# Blocked: 3 messages today (2 pii-phone, 1 content-injection)
# Last violation: 2 hours ago
```

**Future:** Local web dashboard showing:
- Real-time violation feed
- Statistics over time
- Rule configuration UI

**Priority:** Low — Nice for visibility

---

## Implementation Roadmap

| Phase | Items | Effort |
|-------|-------|--------|
| **v0.2** | Webhook alerts, Enhanced injection patterns | 1-2 days |
| **v0.3** | User-configurable rules, CI mode | 1-2 days |
| **v0.4** | Pre-response blocking (if possible), SARIF export | 1 day |
| **v1.0** | Rate limiting, Status dashboard | 2-3 days |

---

## Quick Wins (Can Do Now)

1. **Enhanced injection patterns** — Just add more regex patterns to `content.ts`
2. **CI mode** — Add `--ci` flag to skip animations and exit with code
3. **JSON export** — Add `--format json` to report command

---

## Questions to Resolve

1. Does OpenClaw support a `before_response` hook that can block/modify responses?
2. Should lobstercage config live in `~/.openclaw/lobstercage.json` or `~/.lobstercage.json`?
3. For webhook alerts, should we bundle HTTP client or use fetch?
