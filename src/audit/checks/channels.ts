// Channel access control security checks

import type { SecurityFinding, OpenClawConfig, ChannelConfig } from "../types.js";

const CHANNEL_NAMES = [
  "whatsapp",
  "telegram",
  "discord",
  "slack",
  "signal",
  "imessage",
  "msteams",
  "matrix",
];

export function checkChannels(config: OpenClawConfig): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const channels = config.channels;

  if (!channels) {
    return findings;
  }

  for (const channelName of CHANNEL_NAMES) {
    const channel = channels[channelName] as ChannelConfig | undefined;
    if (!channel || channel.enabled === false) continue;

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
      findings.push({
        id: `channel-${channelName}-dm-empty-allowlist`,
        category: "channels",
        severity: "warning",
        title: `${capitalize(channelName)} DM allowlist is empty`,
        description:
          "DM policy is 'allowlist' but allowFrom is empty. No one can message the agent. Consider using 'pairing' mode instead.",
        location: `channels.${channelName}.allowFrom`,
        currentValue: "[]",
        expectedValue: "List of allowed senders, or use pairing mode",
        fix: "Add sender IDs to allowFrom or change dmPolicy to 'pairing'",
        fixable: false,
      });
    }

    // Check group policy
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

    // Check for wildcard in allowFrom
    if (channel.allowFrom?.includes("*")) {
      findings.push({
        id: `channel-${channelName}-wildcard-allow`,
        category: "channels",
        severity: "critical",
        title: `${capitalize(channelName)} has wildcard allowlist`,
        description: `The allowFrom list includes "*" which allows any sender.`,
        location: `channels.${channelName}.allowFrom`,
        currentValue: '["*"]',
        expectedValue: "Specific sender IDs",
        fix: "Replace wildcard with specific sender allowlist",
        fixable: false,
      });
    }

    const slashCommands = (channel as { slashCommands?: { senderAllowlist?: string[] } })
      .slashCommands;
    if (slashCommands && !slashCommands.senderAllowlist?.length) {
      findings.push({
        id: `channel-${channelName}-slash-no-allowlist`,
        category: "channels",
        severity: "warning",
        title: `${capitalize(channelName)} slash commands have no sender allowlist`,
        description: `Slash commands are enabled but no sender allowlist is configured.`,
        location: `channels.${channelName}.slashCommands.senderAllowlist`,
        expectedValue: "Array of allowed sender IDs",
        fix: "Add a senderAllowlist to restrict who can use slash commands",
        fixable: false,
      });
    }

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
  }

  return findings;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
