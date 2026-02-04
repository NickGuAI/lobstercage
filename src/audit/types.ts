// Audit types for config security checks

export type Severity = "critical" | "warning" | "info";

export type CheckCategory =
  | "gateway"
  | "channels"
  | "filesystem"
  | "tools"
  | "secrets"
  | "plugins"
  | "browser"
  | "approval";

export type SecurityFinding = {
  id: string;
  category: CheckCategory;
  severity: Severity;
  title: string;
  description: string;
  location?: string;
  currentValue?: string;
  expectedValue?: string;
  fix?: string;
  /** If true, can be auto-fixed with --fix flag */
  fixable: boolean;
};

export type AuditResult = {
  findings: SecurityFinding[];
  summary: {
    critical: number;
    warning: number;
    info: number;
  };
  configPath: string | null;
  timestamp: string;
};

export type OpenClawConfig = {
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
  channels?: Record<string, ChannelConfig>;
  logging?: {
    redactSensitive?: "on" | "off" | "auto";
  };
  hooks?: {
    token?: string;
  };
  plugins?: {
    allow?: string[];
  };
  tools?: {
    elevated?: {
      allowFrom?: string[];
    };
    web?: {
      enabled?: boolean;
    };
  };
  browser?: {
    cdp?: {
      url?: string;
    };
  };
  model?: {
    default?: string;
    provider?: string;
  };
};

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

export type FixResult = {
  finding: SecurityFinding;
  success: boolean;
  action?: string;
  error?: string;
};

export type AuditOptions = {
  fix: boolean;
  deep: boolean;
  configPath?: string;
};
