// Audit types for config security checks

export type Severity = "critical" | "warning" | "info";

export type CheckCategory =
  | "gateway"
  | "channels"
  | "filesystem"
  | "tools"
  | "secrets"
  | "plugins"
  | "browser";

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
    bind?: string;
    port?: number;
    auth?: {
      token?: string;
      password?: string;
    };
    tailscale?: boolean;
    controlUI?: {
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
