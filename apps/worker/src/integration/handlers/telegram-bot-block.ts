import type { InboxModel } from "@chatbotx.io/database/types"
import {
  emitContactBlockedBot,
  emitContactUnblockedBot,
} from "@chatbotx.io/events"
import { runWithWebhookExecutionContext } from "@chatbotx.io/events/context"
import { isTelegramMemberStatus } from "@chatbotx.io/integration-telegram"
import type { ChannelAudienceEvent } from "@chatbotx.io/sdk"
import { getRedisConnection } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { resolveExistingContactInbox } from "./received-message"

type BotChatStatusEvent = Extract<
  ChannelAudienceEvent,
  { kind: "botChatStatus" }
>

export type BotBlockTransition = "blocked" | "unblocked"

/** How long a handled (un)block is remembered, so a Telegram retry does not fire twice. */
const BLOCK_EVENT_DEDUPE_TTL_SECONDS = 24 * 60 * 60

/** Whether the bot's status in a chat lets it talk to the user. */
const isActiveBotStatus = (status: string): boolean =>
  isTelegramMemberStatus(status)

/**
 * What a private-chat change of the bot's status means. Telegram reports a
 * block as the bot going to `kicked` and an unblock (or /start after one) as
 * `kicked` → `member`. Anything else (first start, no real change) is null.
 */
export const resolveBotBlockTransition = (
  oldStatus: string | undefined,
  newStatus: string,
): BotBlockTransition | null => {
  if (!oldStatus) {
    return null
  }
  if (newStatus === "kicked" && isActiveBotStatus(oldStatus)) {
    return "blocked"
  }
  if (oldStatus === "kicked" && isActiveBotStatus(newStatus)) {
    return "unblocked"
  }
  return null
}

/** Claims one (un)block for handling; false when a retry of it was already handled. */
const claimBotBlockEventOnce = async (key: {
  inboxId: string
  userSourceId: string
  occurredAt: string
  transition: BotBlockTransition
}): Promise<boolean> => {
  const redisKey = `telegram:bot-block:${key.inboxId}:${key.userSourceId}:${key.occurredAt}:${key.transition}`
  const claimed = await getRedisConnection("hot").set(
    redisKey,
    "1",
    "EX",
    BLOCK_EVENT_DEDUPE_TTL_SECONDS,
    "NX",
  )
  return claimed === "OK"
}

const emitBotBlockTransition = async (props: {
  transition: BotBlockTransition
  workspaceId: string
  contactId: string
  channel: string
  contactInboxId: string
}): Promise<void> => {
  const emit =
    props.transition === "blocked"
      ? emitContactBlockedBot
      : emitContactUnblockedBot
  // The user's own action on the channel: outbound webhooks only deliver
  // channel-originated events, and an audience job is not one by default.
  await runWithWebhookExecutionContext({ source: "webhook" }, () =>
    emit(
      props.workspaceId,
      props.contactId,
      props.channel,
      props.contactInboxId,
    ),
  )
}

/**
 * A user blocked or unblocked the bot in their private chat: fire the
 * matching trigger/webhook event for the existing contact. Never creates a
 * contact — someone who never talked to the bot has nothing to automate.
 */
export const handleTelegramPrivateBotStatus = async (props: {
  inbox: Pick<InboxModel, "id" | "workspaceId" | "channel">
  event: BotChatStatusEvent
}): Promise<void> => {
  const { inbox, event } = props
  const transition = resolveBotBlockTransition(event.oldStatus, event.status)
  if (!transition) {
    return
  }
  const userSourceId = event.user?.sourceId ?? event.chat.id

  const existing = await resolveExistingContactInbox({
    inbox: inbox as InboxModel,
    incomingContact: { sourceId: userSourceId },
  })
  if (!existing) {
    logger.debug(
      { inboxId: inbox.id, transition },
      "Telegram bot (un)blocked by an unknown user; nothing to fire",
    )
    return
  }

  const claimed = await claimBotBlockEventOnce({
    inboxId: inbox.id,
    userSourceId,
    occurredAt: event.occurredAt,
    transition,
  })
  if (!claimed) {
    logger.debug(
      { inboxId: inbox.id, transition },
      "Telegram bot (un)block already handled; skipping retry",
    )
    return
  }

  await emitBotBlockTransition({
    transition,
    workspaceId: inbox.workspaceId,
    contactId: existing.row.contactId,
    channel: inbox.channel,
    contactInboxId: existing.row.id,
  })
}
