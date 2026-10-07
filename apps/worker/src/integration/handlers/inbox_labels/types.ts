import type { channelTypes } from "@chatbotx.io/database/partials"

export type ChannelType =
  | typeof channelTypes.enum.messenger
  | typeof channelTypes.enum.zalo

/** Everything the DB layer needs, resolved once per webhook. */
export type LabelContext = {
  channelType: ChannelType
  workspaceId: string
  integrationId: string
  inboxId: string
  /**
   * Creates the contact for a channel user the inbox has never seen, so a
   * label assigned to them is not dropped. Absent for channels that do not
   * create contacts from label events.
   */
  createMissingContact?: (sourceId: string) => Promise<void>
}

/** Channel-agnostic meaning of an inbox-label webhook. */
export type LabelEvent =
  | { type: "assign"; labelId: string; labelName: string; userIds: string[] }
  | { type: "unassign"; labelId: string; userIds: string[] }
  | { type: "deleteLabel"; labelId: string }

/**
 * A channel plugs in with two functions:
 * - `loadContext`: resolve the integration by its external id; return null when
 *   it is missing or tag sync is disabled.
 * - `toEvents`: validate + normalize the raw webhook payload into events;
 *   return null for an invalid payload.
 */
export type Channel = {
  /** Assigning a label to an unknown user creates their contact first. */
  createsMissingContacts: boolean
  loadContext: (identifier: string) => Promise<LabelContext | null>
  toEvents: (payload: unknown) => LabelEvent[] | null
}

export type ChannelLabelWebhookData = {
  integrationType: ChannelType
  integrationIdentifier: string
  payload: unknown
}
