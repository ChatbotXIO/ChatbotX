import { channelLabel } from "@/features/inboxes/lib/channel-label"
import type { PostAnalyticsGroupByValue } from "../schema"
import { OTHER_SERIES_KEY } from "./series"

type InboxRef = { channel: string; id: string; name: string }

/**
 * The display name of a series key: a channel's brand name, a page / account
 * name, `all` or the folded remainder (translated by the caller).
 */
export const seriesLabel = (
  key: string,
  groupBy: PostAnalyticsGroupByValue,
  inboxes: readonly InboxRef[],
  labels: { all: string; other: string },
): string => {
  if (key === OTHER_SERIES_KEY) {
    return labels.other
  }
  if (groupBy === "channel") {
    return channelLabel(key)
  }
  if (groupBy === "inbox") {
    return inboxes.find((inbox) => inbox.id === key)?.name ?? key
  }
  return labels.all
}

/** The channel a series key stands for, when it stands for one. */
export const seriesChannel = (
  key: string,
  groupBy: PostAnalyticsGroupByValue,
  inboxes: readonly InboxRef[],
): string | undefined => {
  if (groupBy === "channel") {
    return key
  }
  return groupBy === "inbox"
    ? inboxes.find((inbox) => inbox.id === key)?.channel
    : undefined
}
