/**
 * Job name a channel webhook queues for audience events that are not
 * messages: following/unfollowing an account, joining/leaving a group, a
 * message posted in a group the bot sits in, and the bot's own membership in
 * a group/channel. They carry no 1:1 conversation, so they never go through
 * `incomingMessage` (which would open a DM thread and run the bot).
 */
export const CHANNEL_AUDIENCE_EVENT_JOB_NAME = "channelAudienceEvent"

/** Profile fields a channel ships with the event, used when the contact must be created. */
export type ChannelAudienceUser = {
  sourceId: string
  firstName?: string
  lastName?: string
  username?: string
}

export type ChannelAudienceEvent =
  | {
      /** The user started following the account (Zalo OA follow, incl. QR scans). */
      kind: "follow" | "unfollow"
      user: ChannelAudienceUser
      /** ISO time of the channel event — keeps retries idempotent. */
      occurredAt: string
      /** Where the follow came from when the channel says (e.g. Zalo `source`). */
      source?: string
    }
  | {
      /** The user joined or left a group/channel the bot administers. */
      kind: "groupJoin" | "groupLeave"
      user: ChannelAudienceUser
      chatId: string
      occurredAt: string
    }
  | {
      /** The user posted in a group the bot sits in. */
      kind: "groupMessage"
      user: ChannelAudienceUser
      chatId: string
      messageId: string
      textLength: number
      occurredAt: string
    }
  | {
      /** The bot's own status in a group/channel changed. */
      kind: "botChatStatus"
      chat: { id: string; title?: string; type: string }
      /** The bot's new member status (e.g. administrator, member, left, kicked). */
      status: string
      occurredAt: string
    }

export type ChannelAudienceEventJobData = {
  integrationType: string
  integrationIdentifier: string
  event: ChannelAudienceEvent
}
