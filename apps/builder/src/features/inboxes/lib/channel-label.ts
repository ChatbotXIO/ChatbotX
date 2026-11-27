import { allInboxConfigs } from "../provider/inbox-hook"

/** Brand names the inbox config table does not carry (or spells differently). */
const CHANNEL_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  api: "API",
  threads: "Threads",
}

/** App-wide display name of a channel (a brand name, not translated). */
export const channelLabel = (channel: string): string =>
  CHANNEL_LABEL_OVERRIDES[channel] ??
  allInboxConfigs[channel as keyof typeof allInboxConfigs]?.label ??
  channel
