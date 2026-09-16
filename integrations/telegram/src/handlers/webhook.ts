import {
  CHANNEL_AUDIENCE_EVENT_JOB_NAME,
  type ChannelAudienceEventJobData,
  type ChannelAudienceUser,
  type HandleRequestProps,
} from "@chatbotx.io/sdk"
import { toBullMqSafeIdSegment } from "@chatbotx.io/utils"
import { timingSafeStringEqual } from "@chatbotx.io/utils/crypto"
import { TelegramWebhookException } from "../exception"
import type {
  TelegramChatMember,
  TelegramChatMemberUpdated,
  TelegramConfig,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from "../schema"
import { telegramUpdateSchema } from "../schema"

const GROUP_CHAT_TYPES = new Set(["group", "supergroup"])

/** Whether a `ChatMember` status means the user is currently in the chat. */
export const isTelegramMemberStatus = (
  status: string,
  isMember?: boolean,
): boolean =>
  status === "creator" ||
  status === "administrator" ||
  status === "member" ||
  (status === "restricted" && isMember === true)

const isChatMember = (member: TelegramChatMember): boolean =>
  isTelegramMemberStatus(member.status, member.is_member)

const toAudienceUser = (user: TelegramUser): ChannelAudienceUser => ({
  sourceId: String(user.id),
  firstName: user.first_name,
  ...(user.last_name ? { lastName: user.last_name } : {}),
  ...(user.username ? { username: user.username } : {}),
})

const toIso = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toISOString()

/** A message posted in a group/supergroup — scored only, never a DM. */
export const isTelegramGroupMessage = (message: TelegramMessage): boolean =>
  GROUP_CHAT_TYPES.has(message.chat.type)

const audienceJob = (
  integrationIdentifier: string,
  event: ChannelAudienceEventJobData["event"],
): ChannelAudienceEventJobData => ({
  integrationType: "telegram",
  integrationIdentifier,
  event,
})

const parseMembershipChange = (
  integrationIdentifier: string,
  update: TelegramChatMemberUpdated,
): ChannelAudienceEventJobData | null => {
  const user = update.new_chat_member.user
  if (user.is_bot) {
    return null
  }
  const wasMember = isChatMember(update.old_chat_member)
  const isMember = isChatMember(update.new_chat_member)
  if (wasMember === isMember) {
    return null
  }
  return audienceJob(integrationIdentifier, {
    kind: isMember ? "groupJoin" : "groupLeave",
    user: toAudienceUser(user),
    chatId: String(update.chat.id),
    occurredAt: toIso(update.date),
  })
}

/**
 * Maps the non-DM parts of an update to audience jobs: the bot's own
 * membership (`my_chat_member`), members joining/leaving (`chat_member`) and
 * messages posted in groups. Returns null for anything that is a 1:1 bot
 * conversation (handled by `incomingMessage`) or not interesting.
 */
export const parseTelegramAudienceEvent = (
  integrationIdentifier: string,
  update: TelegramUpdate,
): ChannelAudienceEventJobData | null => {
  if (update.my_chat_member) {
    const { chat, new_chat_member, date } = update.my_chat_member
    return audienceJob(integrationIdentifier, {
      kind: "botChatStatus",
      chat: {
        id: String(chat.id),
        type: chat.type,
        ...(chat.title ? { title: chat.title } : {}),
      },
      status: new_chat_member.status,
      occurredAt: toIso(date),
    })
  }
  if (update.chat_member) {
    return parseMembershipChange(integrationIdentifier, update.chat_member)
  }
  const message = update.message
  if (message && isTelegramGroupMessage(message)) {
    if (!message.from || message.from.is_bot) {
      return null
    }
    return audienceJob(integrationIdentifier, {
      kind: "groupMessage",
      user: toAudienceUser(message.from),
      chatId: String(message.chat.id),
      messageId: String(message.message_id),
      textLength: (message.text ?? message.caption ?? "").length,
      occurredAt: toIso(message.date),
    })
  }
  return null
}

export const webhookHandler = async (
  props: HandleRequestProps<TelegramConfig>,
): Promise<string> => {
  const { req, config, queue } = props

  // Bots connected since secret tokens were introduced must present it on
  // every update. Legacy bots (no stored token) keep their DM path, but
  // their group/membership events are not trusted for scoring (below).
  const presentedSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token")
  const verified = Boolean(
    config.webhookSecretToken &&
      presentedSecret &&
      timingSafeStringEqual(presentedSecret, config.webhookSecretToken),
  )
  if (config.webhookSecretToken && !verified) {
    throw new TelegramWebhookException("Invalid webhook secret token")
  }

  const body = await req.text()
  if (!body) {
    throw new TelegramWebhookException("Empty webhook payload")
  }

  const update = telegramUpdateSchema.parse(JSON.parse(body))

  const integrationIdentifier = config.botId ?? ""

  if (update.callback_query) {
    const chatId = update.callback_query.message?.chat.id
    if (!chatId) {
      return "ok"
    }

    await queue?.add(
      "incomingMessage",
      {
        type: "incomingMessage",
        data: {
          integrationType: "telegram",
          integrationIdentifier,
          payload: update,
        },
      },
      {
        jobId: `incoming-telegram-${toBullMqSafeIdSegment(integrationIdentifier)}-${update.update_id}`,
      },
    )
    return "ok"
  }

  // Group/channel traffic must never reach `incomingMessage`, which treats
  // every message as a 1:1 DM (opens a thread, runs the bot).
  const audienceEvent = parseTelegramAudienceEvent(
    integrationIdentifier,
    update,
  )
  if (audienceEvent) {
    // Group activity awards leaderboard points: only from a verified bot.
    if (!verified) {
      return "ok"
    }
    await queue?.add(CHANNEL_AUDIENCE_EVENT_JOB_NAME, {
      type: CHANNEL_AUDIENCE_EVENT_JOB_NAME,
      data: audienceEvent,
    })
    return "ok"
  }

  // A group message without a scorable sender (anonymous admin, bot) is
  // still group traffic: drop it rather than fall through to the DM path.
  if (!update.message || isTelegramGroupMessage(update.message)) {
    return "ok"
  }

  await queue?.add(
    "incomingMessage",
    {
      type: "incomingMessage",
      data: {
        integrationType: "telegram",
        integrationIdentifier,
        payload: update,
      },
    },
    {
      jobId: `incoming-telegram-${toBullMqSafeIdSegment(integrationIdentifier)}-${update.update_id}`,
    },
  )

  return "ok"
}
