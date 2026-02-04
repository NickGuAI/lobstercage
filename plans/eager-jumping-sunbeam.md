# Lobstercage Security Principles Scanner - Detailed Implementation

## Overview

Enhance lobstercage to scan OpenClaw configs for violations of the 5 security principles, and auto-fix them.

**IMPORTANT BUG FIX**: The current lobstercage `ChannelConfig` type is incorrect. OpenClaw uses `dmPolicy`/`groupPolicy` directly on channels, not `dm.policy`/`group.policy`. This must be fixed.

---

## The 5 Security Principles

1. **Private access only** - No public admin pages
2. **Pair unknown senders / allowlist shared channels** - Explicit approval for inbound access
3. **Human approval for irreversible actions** - Dangerous operations require confirmation
4. **Separate accounts/keys** - Credential isolation
5. **Skills = untrusted software** - Plugin/skill trust verification

---

## File: `/home/ec2-user/App/lobstercage/src/audit/types.ts`

### Changes Required

**1. Fix `ChannelConfig` to match actual OpenClaw structure:**

```typescript
// CURRENT (WRONG):
export type ChannelConfig = {
  enabled?: boolean;
  dm?: {
    policy?: "open" | "disabled" | "allowlist";
  };
  group?: {
    policy?: "open" | "disabled" | "allowlist";
  };
  allowFrom?: string[];
  slashCommands?: {
    senderAllowlist?: string[];
  };
};

// REPLACE WITH (CORRECT - matches OpenClaw src/config/types.whatsapp.ts):
export type ChannelConfig = {
  enabled?: boolean;
  /** Direct message access policy (default: pairing). */
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  /** Group message policy. */
  groupPolicy?: "open" | "disabled" | "allowlist";
  /** Optional allowlist for direct chats. */
  allowFrom?: string[];
  /** Optional allowlist for group senders. */
  groupAllowFrom?: string[];
  /** Per-account config (for multi-account channels like WhatsApp). */
  accounts?: Record<string, ChannelAccountConfig>;
};

export type ChannelAccountConfig = {
  enabled?: boolean;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  groupPolicy?: "open" | "disabled" | "allowlist";
  allowFrom?: string[];
  groupAllowFrom?: string[];
};
```

**2. Extend `OpenClawConfig` gateway type to include bind mode and tailscale:**

```typescript
// CURRENT (WRONG):
gateway?: {
  bind?: string;          // Wrong: should be enum
  tailscale?: boolean;    // Wrong: should be object
  // ...
};

// REPLACE WITH (matches OpenClaw src/config/types.gateway.ts):
gateway?: {
  bind?: "auto" | "lan" | "loopback" | "custom" | "tailnet";
  customBindHost?: string;
  port?: number;
  auth?: {
    token?: string;
    password?: string;
  };
  tailscale?: {
    mode?: "off" | "serve" | "funnel";
    resetOnExit?: boolean;
  };
  tls?: {
    enabled?: boolean;
  };
  controlUI?: {
    enabled?: boolean;
    basePath?: string;
    allowInsecureAuth?: boolean;
    dangerouslyDisableDeviceAuth?: boolean;
  };
};
```

**3. Add `CheckCategory` for approval:**

```typescript
export type CheckCategory =
  | "gateway"
  | "channels"
  | "filesystem"
  | "tools"
  | "secrets"
  | "plugins"
  | "browser"
  | "approval";  // ADD THIS
```

---

## File: `/home/ec2-user/App/lobstercage/src/audit/checks/gateway.ts`

### Current State (BROKEN)
- The current `isBoundBeyondLoopback` check treats `gateway.bind` as an IP address
- But OpenClaw uses bind **modes** ("lan", "loopback", "custom", "tailnet"), not IPs!
- Example: If user has `bind: "loopback"`, current check sees `"loopback" !== "127.0.0.1"` → TRUE → false positive!

### Required Fixes

**1. FIX the bind mode detection (replace lines 15-18):**

```typescript
// Check bind mode - OpenClaw uses modes, not IP addresses
const bindMode = (gateway.bind || "loopback") as string;

// Determine if gateway is exposed beyond loopback based on MODE
const isExposedBind =
  bindMode === "lan" ||  // 0.0.0.0 - all interfaces
  bindMode === "auto" || // can fall back to 0.0.0.0
  (bindMode === "custom" && gateway.customBindHost &&
   !["127.0.0.1", "localhost", "::1"].includes(gateway.customBindHost));
```

**2. Update the no-auth check (replace lines 20-38) to use new variable:**

```typescript
if (isExposedBind) {
  const hasToken = !!gateway.auth?.token || !!process.env.OPENCLAW_GATEWAY_TOKEN;
  const hasPassword = !!gateway.auth?.password || !!process.env.OPENCLAW_GATEWAY_PASSWORD;
  const hasTailscale = !!gateway.tailscale;

  if (!hasToken && !hasPassword && !hasTailscale) {
    findings.push({
      id: "gateway-no-auth",
      category: "gateway",
      severity: "critical",
      title: "Gateway exposed without authentication",
      description: `Gateway bind mode is "${bindMode}" which exposes it beyond localhost, but no authentication is configured.`,
      location: "gateway.bind",
      currentValue: bindMode,
      expectedValue: "loopback (or configure auth)",
      fix: "Set gateway.bind to 'loopback' or configure gateway.auth.token",
      fixable: false,
    });
  }
}
```

**3. ADD new check for public bind mode (Principle 1: Private access):**

```typescript
// Add after the no-auth check:

// Even with auth, warn about public exposure
if (bindMode === "lan") {
  findings.push({
    id: "gateway-public-bind",
    category: "gateway",
    severity: "critical",
    title: "Gateway binds to all network interfaces",
    description: `Gateway bind mode is "lan" which exposes it on all interfaces (0.0.0.0). Use "loopback" and Tailscale serve for remote access.`,
    location: "gateway.bind",
    currentValue: "lan",
    expectedValue: "loopback",
    fix: "Set gateway.bind to 'loopback' and use Tailscale serve for remote access",
    fixable: true,
  });
}
```

**4. FIX tailscale check (replace lines 91-105):**

The current type `tailscale?: boolean` is wrong. OpenClaw uses `tailscale?: { mode?: "off" | "serve" | "funnel" }`.

```typescript
// Replace the existing tailscale check with mode-aware logic:

// Handle tailscale as object (OpenClaw format) - need to cast since types are wrong
const tailscaleConfig = gateway.tailscale as { mode?: string } | undefined;

if (tailscaleConfig?.mode === "funnel") {
  findings.push({
    id: "gateway-funnel-exposed",
    category: "gateway",
    severity: "critical",
    title: "Gateway exposed via Tailscale Funnel",
    description: "Tailscale Funnel mode exposes the gateway to the public internet. Anyone can reach your agent.",
    location: "gateway.tailscale.mode",
    currentValue: "funnel",
    expectedValue: "serve or off",
    fix: "Set gateway.tailscale.mode to 'serve' (tailnet-only) or 'off'",
    fixable: true,
  });
} else if (tailscaleConfig?.mode === "serve") {
  findings.push({
    id: "gateway-tailscale-serve",
    category: "gateway",
    severity: "info",
    title: "Gateway uses Tailscale serve",
    description: "Tailscale serve mode enabled. Gateway is accessible within your tailnet.",
    location: "gateway.tailscale.mode",
    currentValue: "serve",
    fix: "Verify only trusted devices are on your tailnet",
    fixable: false,
  });
} else if (tailscaleConfig) {
  // Tailscale enabled but mode not specified (defaults to off or legacy format)
  findings.push({
    id: "gateway-tailscale-enabled",
    category: "gateway",
    severity: "info",
    title: "Tailscale configuration present",
    description: "Tailscale is configured. Check tailscale.mode setting.",
    location: "gateway.tailscale",
    fixable: false,
  });
}
```

**5. ADD control UI exposure check:**

```typescript
// Add after tailscale checks:

const controlUiEnabled = gateway.controlUI?.enabled !== false;
const isPubliclyExposed = bindMode === "lan" || tailscaleConfig?.mode === "funnel";

if (controlUiEnabled && isPubliclyExposed) {
  findings.push({
    id: "gateway-control-ui-exposed",
    category: "gateway",
    severity: "critical",
    title: "Control UI exposed to public network",
    description: "The control UI is enabled and the gateway is publicly accessible. Admin interface is exposed.",
    location: "gateway.controlUI.enabled",
    currentValue: "true (default)",
    expectedValue: "false, or use loopback/tailscale serve",
    fix: "Disable control UI or restrict gateway to loopback",
    fixable: true,
  });
}
```

---

## File: `/home/ec2-user/App/lobstercage/src/audit/checks/channels.ts`

### Current State (BROKEN)
- Uses `channel.dm?.policy` but OpenClaw uses `channel.dmPolicy`
- Uses `channel.group?.policy` but OpenClaw uses `channel.groupPolicy`
- Doesn't check for "pairing" policy

### Required Fixes

**1. Fix property access throughout the file:**

```typescript
// CHANGE ALL INSTANCES OF:
channel.dm?.policy    → channel.dmPolicy
channel.group?.policy → channel.groupPolicy
```

**2. Update DM policy check (Principle 2):**

```typescript
// Replace lines 29-42:

// Check DM policy - "open" is dangerous, "pairing" is recommended
if (channel.dmPolicy === "open") {
  findings.push({
    id: `channel-${channelName}-dm-open`,
    category: "channels",
    severity: "critical",
    title: `${capitalize(channelName)} DMs are open to anyone`,
    description: `Anyone can send DMs to your agent on ${capitalize(channelName)}. This exposes the agent to prompt injection and abuse.`,
    location: `channels.${channelName}.dmPolicy`,
    currentValue: "open",
    expectedValue: "pairing (recommended) or allowlist",
    fix: "Set dmPolicy to 'pairing' to require sender verification",
    fixable: true,
  });
} else if (channel.dmPolicy === "allowlist" && (!channel.allowFrom || channel.allowFrom.length === 0)) {
  // Allowlist mode but empty allowlist
  findings.push({
    id: `channel-${channelName}-dm-empty-allowlist`,
    category: "channels",
    severity: "warning",
    title: `${capitalize(channelName)} DM allowlist is empty`,
    description: `DM policy is 'allowlist' but allowFrom is empty. No one can message the agent. Consider using 'pairing' mode instead.`,
    location: `channels.${channelName}.allowFrom`,
    currentValue: "[]",
    expectedValue: "List of allowed senders, or use pairing mode",
    fix: "Add sender IDs to allowFrom or change dmPolicy to 'pairing'",
    fixable: false,
  });
}
```

**3. Update group policy check (Principle 2):**

```typescript
// Replace lines 45-61:

if (channel.groupPolicy === "open") {
  const hasElevatedWildcard = config.tools?.elevated?.allowFrom?.includes("*");
  const severity = hasElevatedWildcard ? "critical" : "warning";

  findings.push({
    id: `channel-${channelName}-group-open`,
    category: "channels",
    severity,
    title: `${capitalize(channelName)} groups are open`,
    description: `Anyone in groups can trigger your agent.${hasElevatedWildcard ? " Combined with wildcard elevated tools, this is critical." : ""} Use allowlist to restrict who can interact.`,
    location: `channels.${channelName}.groupPolicy`,
    currentValue: "open",
    expectedValue: "allowlist",
    fix: "Set groupPolicy to 'allowlist' and configure groupAllowFrom",
    fixable: true,
  });
}
```

**4. Add check for multi-account channels:**

```typescript
// Add after main channel checks:

// Check per-account configs for multi-account channels (e.g., WhatsApp)
if (channel.accounts) {
  for (const [accountId, accountConfig] of Object.entries(channel.accounts)) {
    if (accountConfig.enabled === false) continue;

    if (accountConfig.dmPolicy === "open") {
      findings.push({
        id: `channel-${channelName}-account-${accountId}-dm-open`,
        category: "channels",
        severity: "critical",
        title: `${capitalize(channelName)} account "${accountId}" DMs are open`,
        description: `Account "${accountId}" has open DM policy.`,
        location: `channels.${channelName}.accounts.${accountId}.dmPolicy`,
        currentValue: "open",
        expectedValue: "pairing",
        fix: "Set dmPolicy to 'pairing'",
        fixable: true,
      });
    }

    if (accountConfig.groupPolicy === "open") {
      findings.push({
        id: `channel-${channelName}-account-${accountId}-group-open`,
        category: "channels",
        severity: "warning",
        title: `${capitalize(channelName)} account "${accountId}" groups are open`,
        description: `Account "${accountId}" has open group policy.`,
        location: `channels.${channelName}.accounts.${accountId}.groupPolicy`,
        currentValue: "open",
        expectedValue: "allowlist",
        fix: "Set groupPolicy to 'allowlist'",
        fixable: true,
      });
    }
  }
}
```

---

## File: `/home/ec2-user/App/lobstercage/src/audit/checks/approval.ts` (NEW FILE)

**Create this new file for Principle 3: Human approval for irreversible actions**

NOTE: The wildcard elevated check (`tools.elevated.allowFrom?.includes("*")`) already exists in `tools.ts` as `tools-elevated-wildcard`. We should NOT duplicate it here. Instead, this file focuses on additional approval-related checks.

```typescript
// Human approval security checks for irreversible actions

import type { SecurityFinding, OpenClawConfig } from "../types.js";

export function checkApproval(config: OpenClawConfig): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  const elevatedAllowFrom = config.tools?.elevated?.allowFrom;

  // If no elevated access configured, that's secure by default
  if (!elevatedAllowFrom || elevatedAllowFrom.length === 0) {
    return findings;
  }

  // NOTE: Wildcard check is already in tools.ts as tools-elevated-wildcard
  // Don't duplicate it here

  // Check if multiple senders have elevated access (potential over-provisioning)
  if (elevatedAllowFrom.length > 3 && !elevatedAllowFrom.includes("*")) {
    findings.push({
      id: "approval-elevated-many-users",
      category: "approval",
      severity: "info",
      title: "Multiple users have elevated tool access",
      description: `${elevatedAllowFrom.length} senders have elevated tool access. Elevated tools can perform irreversible actions. Consider limiting to essential users only.`,
      location: "tools.elevated.allowFrom",
      currentValue: `${elevatedAllowFrom.length} users`,
      expectedValue: "Minimal set of trusted users (1-3)",
      fix: "Review and remove unnecessary elevated access grants",
      fixable: false,
    });
  }

  // Future: Check for approval forwarding config (ApprovalsConfig.exec)
  // OpenClaw's approvals.exec config forwards approval requests to chat
  // We could check if this is enabled for critical operations

  return findings;
}
```

---

## File: `/home/ec2-user/App/lobstercage/src/audit/checks/secrets.ts`

### Current State
- Has checks for: password-in-config, token-in-config, token-reuse, hooks-short-token, redaction-off

### New Checks to Add (Principle 4: Separate keys)

**Add after line 55 (after token-reuse check):**

```typescript
// Check for same credentials used across multiple channel accounts
// This requires scanning channel-specific API keys/tokens if present in config
// Currently OpenClaw doesn't store channel API keys in the main config (they use env vars)
// But we should warn if we detect patterns

// Future enhancement: Load credentials from ~/.openclaw/credentials/ and check for reuse
// For now, add an informational check about credential hygiene

const gatewayHasToken = !!config.gateway?.auth?.token;
const gatewayHasPassword = !!config.gateway?.auth?.password;

if (gatewayHasToken && gatewayHasPassword) {
  findings.push({
    id: "secrets-multiple-auth-methods",
    category: "secrets",
    severity: "info",
    title: "Multiple gateway auth methods configured",
    description: "Both token and password are configured for gateway auth. Consider using only one method.",
    location: "gateway.auth",
    fix: "Remove one auth method (prefer token)",
    fixable: false,
  });
}
```

---

## File: `/home/ec2-user/App/lobstercage/src/audit/checks/plugins.ts`

### Current State
- Has checks for: no-allowlist, not-in-allowlist, wildcard-allow

### Changes Required (Principle 5: Skills = untrusted)

**1. Make wildcard-allow critical (line 76-89):**

```typescript
// CHANGE severity from "warning" to "critical":
if (allowedPlugins.includes("*")) {
  findings.push({
    id: "plugins-wildcard-allow",
    category: "plugins",
    severity: "critical",  // CHANGED from "warning"
    title: "All plugins trusted via wildcard",
    description: `plugins.allow includes "*" which trusts ANY plugin. Skills/plugins are untrusted software until proven otherwise.`,
    location: "plugins.allow",
    currentValue: '["*"]',
    expectedValue: "Explicit list of verified plugins",
    fix: "Replace '*' with explicit list of trusted plugin IDs",
    fixable: true,  // CHANGED - we can auto-fix by replacing with installed list
  });
}
```

**2. Make no-allowlist fixable (line 43-55):**

```typescript
// CHANGE fixable to true:
findings.push({
  id: "plugins-no-allowlist",
  category: "plugins",
  severity: "warning",
  title: "Extensions installed without explicit allowlist",
  description: `${installedExtensions.length} extension(s) installed but plugins.allow is not configured. Explicitly allowlist trusted plugins.`,
  location: "plugins.allow",
  expectedValue: "Array of allowed plugin IDs",
  fix: `Set plugins.allow to explicitly list trusted extensions`,
  fixable: true,  // CHANGED - can auto-generate allowlist from installed
});
```

---

## File: `/home/ec2-user/App/lobstercage/src/audit/runner.ts`

### Changes Required

**Add import and call for approval checks:**

```typescript
// Add import at top:
import { checkApproval } from "./checks/approval.js";

// Add in runAudit function (after line 30):
findings.push(...checkApproval(config));
```

---

## File: `/home/ec2-user/App/lobstercage/src/audit/fix.ts`

### New Fix Handlers to Add

**Add these cases in the `applyFix` switch statement (after line 89):**

```typescript
// Gateway fixes (Principle 1)
case "gateway-public-bind":
  return await patchConfig((config) => {
    if (!config.gateway) config.gateway = {};
    // Set bind MODE to "loopback", not an IP address
    (config.gateway as any).bind = "loopback";
    return config;
  }, "Set gateway.bind to 'loopback'");

case "gateway-funnel-exposed":
  return await patchConfig((config) => {
    if (!config.gateway) config.gateway = {};
    // Tailscale is an object with mode property
    if (!(config.gateway as any).tailscale) (config.gateway as any).tailscale = {};
    (config.gateway as any).tailscale.mode = "serve";
    return config;
  }, "Set gateway.tailscale.mode to 'serve'");

case "gateway-control-ui-exposed":
  return await patchConfig((config) => {
    if (!config.gateway) config.gateway = {};
    if (!config.gateway.controlUI) config.gateway.controlUI = {};
    config.gateway.controlUI.enabled = false;
    return config;
  }, "Set gateway.controlUI.enabled to false");

// Plugin fixes (Principle 5)
case "plugins-no-allowlist":
  // Auto-generate allowlist from installed extensions
  return await patchConfigWithExtensions((config, extensions) => {
    if (!config.plugins) config.plugins = {};
    config.plugins.allow = extensions.filter(e => e !== "lobstercage");
    return config;
  }, "Generated plugins.allow from installed extensions");

case "plugins-wildcard-allow":
  // Replace wildcard with explicit list
  return await patchConfigWithExtensions((config, extensions) => {
    if (!config.plugins) config.plugins = {};
    config.plugins.allow = extensions.filter(e => e !== "lobstercage");
    return config;
  }, "Replaced plugins.allow wildcard with explicit list");
```

**Add helper function for extension-aware patching:**

```typescript
import { loadExtensionsDir } from "./config-loader.js";

async function patchConfigWithExtensions(
  patcher: (config: OpenClawConfig, extensions: string[]) => OpenClawConfig,
  actionDescription: string
): Promise<FixResult> {
  const loaded = await loadConfig();
  if (!loaded) {
    return {
      finding: {} as SecurityFinding,
      success: false,
      error: "No config file found to patch",
    };
  }

  const extDir = await loadExtensionsDir();
  const extensions = extDir?.extensions || [];

  const { config, path } = loaded;
  const patched = patcher(config, extensions);

  await writeFile(path, JSON.stringify(patched, null, 2) + "\n", "utf-8");

  return {
    finding: {} as SecurityFinding,
    success: true,
    action: `${actionDescription} in ${path}`,
  };
}
```

**Update channel policy fixes to use correct property names:**

```typescript
// REPLACE the existing channel fix handlers (lines 65-89):

// Handle channel DM policy fixes (use dmPolicy not dm.policy)
if (finding.id.match(/^channel-(\w+)-dm-open$/)) {
  const channel = finding.id.match(/^channel-(\w+)-dm-open$/)?.[1];
  if (channel) {
    return await patchConfig((config) => {
      if (!config.channels) config.channels = {};
      if (!config.channels[channel]) config.channels[channel] = {};
      (config.channels[channel] as any).dmPolicy = "pairing";
      return config;
    }, `Set channels.${channel}.dmPolicy to 'pairing'`);
  }
}

// Handle channel group policy fixes (use groupPolicy not group.policy)
if (finding.id.match(/^channel-(\w+)-group-open$/)) {
  const channel = finding.id.match(/^channel-(\w+)-group-open$/)?.[1];
  if (channel) {
    return await patchConfig((config) => {
      if (!config.channels) config.channels = {};
      if (!config.channels[channel]) config.channels[channel] = {};
      (config.channels[channel] as any).groupPolicy = "allowlist";
      return config;
    }, `Set channels.${channel}.groupPolicy to 'allowlist'`);
  }
}

// Handle per-account DM policy fixes
if (finding.id.match(/^channel-(\w+)-account-(\w+)-dm-open$/)) {
  const match = finding.id.match(/^channel-(\w+)-account-(\w+)-dm-open$/);
  if (match) {
    const [, channel, accountId] = match;
    return await patchConfig((config) => {
      if (!config.channels) config.channels = {};
      if (!config.channels[channel]) config.channels[channel] = {};
      const ch = config.channels[channel] as any;
      if (!ch.accounts) ch.accounts = {};
      if (!ch.accounts[accountId]) ch.accounts[accountId] = {};
      ch.accounts[accountId].dmPolicy = "pairing";
      return config;
    }, `Set channels.${channel}.accounts.${accountId}.dmPolicy to 'pairing'`);
  }
}

// Handle per-account group policy fixes
if (finding.id.match(/^channel-(\w+)-account-(\w+)-group-open$/)) {
  const match = finding.id.match(/^channel-(\w+)-account-(\w+)-group-open$/);
  if (match) {
    const [, channel, accountId] = match;
    return await patchConfig((config) => {
      if (!config.channels) config.channels = {};
      if (!config.channels[channel]) config.channels[channel] = {};
      const ch = config.channels[channel] as any;
      if (!ch.accounts) ch.accounts = {};
      if (!ch.accounts[accountId]) ch.accounts[accountId] = {};
      ch.accounts[accountId].groupPolicy = "allowlist";
      return config;
    }, `Set channels.${channel}.accounts.${accountId}.groupPolicy to 'allowlist'`);
  }
}
```

---

## Summary of All Changes

| File | Changes |
|------|---------|
| `src/audit/types.ts` | Fix ChannelConfig (dmPolicy/groupPolicy), extend gateway type, add "approval" category |
| `src/audit/checks/gateway.ts` | Add 3 checks: `gateway-public-bind`, `gateway-funnel-exposed`, `gateway-control-ui-exposed` |
| `src/audit/checks/channels.ts` | Fix property names (dmPolicy/groupPolicy), add empty-allowlist check, add multi-account checks |
| `src/audit/checks/approval.ts` | **NEW FILE** - 2 checks for elevated tool access |
| `src/audit/checks/secrets.ts` | Add `secrets-multiple-auth-methods` check |
| `src/audit/checks/plugins.ts` | Make wildcard critical & fixable, make no-allowlist fixable |
| `src/audit/runner.ts` | Import and call checkApproval |
| `src/audit/fix.ts` | Add 7 new fix handlers, add patchConfigWithExtensions helper, fix channel property names |

---

## Verification

### Step 1: Build
```bash
cd /home/ec2-user/App/lobstercage && pnpm build
```

### Step 2: Test with violations config
Create `~/.openclaw/openclaw.json` with all violations:
```json
{
  "gateway": {
    "bind": "lan",
    "tailscale": { "mode": "funnel" }
  },
  "channels": {
    "whatsapp": {
      "dmPolicy": "open",
      "groupPolicy": "open"
    }
  },
  "plugins": {
    "allow": ["*"]
  },
  "tools": {
    "elevated": {
      "allowFrom": ["*"]
    }
  }
}
```

### Step 3: Run scan
```bash
lobstercage catch
```

**Expected findings:**
- `gateway-public-bind` (critical) - bind mode is "lan"
- `gateway-funnel-exposed` (critical) - tailscale funnel mode
- `gateway-control-ui-exposed` (critical) - control UI with public exposure
- `channel-whatsapp-dm-open` (critical) - dmPolicy is "open"
- `channel-whatsapp-group-open` (warning) - groupPolicy is "open"
- `plugins-wildcard-allow` (critical) - plugins.allow has "*"
- `tools-elevated-wildcard` (critical) - elevated allowFrom has "*"

### Step 4: Run fix
```bash
lobstercage catch --fix
```

**Expected fixes applied:**
- `gateway.bind` → "loopback"
- `gateway.tailscale.mode` → "serve"
- `gateway.controlUI.enabled` → false
- `channels.whatsapp.dmPolicy` → "pairing"
- `channels.whatsapp.groupPolicy` → "allowlist"
- `plugins.allow` → ["<installed-extensions>"] (replaces wildcard)

### Step 5: Re-scan and verify reduced findings
```bash
lobstercage catch
```

Should only show:
- `tools-elevated-wildcard` (critical) - can't auto-fix, needs user input

### Step 6: Run existing tests
```bash
pnpm test
```

### Step 7: Verify config format correctness
After fix, `~/.openclaw/openclaw.json` should have:
```json
{
  "gateway": {
    "bind": "loopback",
    "tailscale": { "mode": "serve" },
    "controlUI": { "enabled": false }
  },
  "channels": {
    "whatsapp": {
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist"
    }
  },
  "plugins": {
    "allow": []
  },
  "tools": {
    "elevated": {
      "allowFrom": ["*"]
    }
  }
}
```
