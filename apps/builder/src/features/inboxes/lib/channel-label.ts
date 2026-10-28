import { allInboxConfigs } from "../provider/inbox-hook"

/** App-wide display name of a channel (a brand name, not translated). */
export const channelLabel = (channel: string): string =>
  allInboxConfigs[channel as keyof typeof allInboxConfigs]?.label ?? channel
