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

    // Check DM policy
    if (channel.dm?.policy === "open") {
      findings.push({
        id: `channel-${channelName}-dm-open`,
        category: "channels",
        severity: "critical",
        title: `${capitalize(channelName)} DMs are open`,
        description: `Anyone can send DMs to your agent on ${capitalize(channelName)}. This exposes the agent to prompt injection and abuse.`,
        location: `channels.${channelName}.dm.policy`,
        currentValue: "open",
        expectedValue: "allowlist or disabled",
        fix: "Use allowlist policy with pairing or disable DMs",
        fixable: true,
      });
    }

    // Check group policy
    if (channel.group?.policy === "open") {
      const hasElevatedTools = config.tools?.elevated?.allowFrom?.includes("*");
      const severity = hasElevatedTools ? "critical" : "warning";

      findings.push({
        id: `channel-${channelName}-group-open`,
        category: "channels",
        severity,
        title: `${capitalize(channelName)} groups are open`,
        description: `Anyone in groups can trigger your agent on ${capitalize(channelName)}.${hasElevatedTools ? " Combined with wildcard elevated tools, this is critical." : ""}`,
        location: `channels.${channelName}.group.policy`,
        currentValue: "open",
        expectedValue: "allowlist or disabled",
        fix: "Use allowlist policy to restrict who can trigger the agent",
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

    // Check for missing slash command sender allowlist
    if (channel.slashCommands && !channel.slashCommands.senderAllowlist?.length) {
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
  }

  return findings;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
