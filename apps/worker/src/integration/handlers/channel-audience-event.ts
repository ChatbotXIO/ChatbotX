import {
  enqueueLeaderboardAward,
  enqueueLeaderboardReverse,
  inboxHasLeaderboardRule,
  recordTelegramBotChatStatus,
} from "@chatbotx.io/business/leaderboard"
import {
  type ContactSource,
  contactSources,
  type IntegrationType,
} from "@chatbotx.io/database/partials"
import type { InboxModel } from "@chatbotx.io/database/types"
import type {
  ChannelAudienceEvent,
  ChannelAudienceUser,
  IncomingContact,
} from "@chatbotx.io/sdk"
import type { IntegrationJobChannelAudienceEvent } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { integrationService } from "../../services/integrations"
import {
  detectContactAndConversation,
  resolveExistingContactInbox,
} from "./received-message"

type PersonEvent = Exclude<ChannelAudienceEvent, { kind: "botChatStatus" }>
type IntegrationRow = Parameters<
  typeof detectContactAndConversation
>[0]["integrationRow"]

const toIncomingContact = (user: ChannelAudienceUser): IncomingContact => ({
  sourceId: user.sourceId,
  ...(user.firstName ? { firstName: user.firstName } : {}),
  ...(user.lastName ? { lastName: user.lastName } : {}),
  ...(user.username ? { sourceUsername: user.username } : {}),
})

/** Undo events never create a contact: with no contact there is nothing to take back. */
const isUndoEvent = (event: PersonEvent) =>
  event.kind === "unfollow" || event.kind === "groupLeave"

/** The leaderboard rule an audience event can score. */
const ruleFor = (event: PersonEvent) => {
  if (event.kind === "follow" || event.kind === "unfollow") {
    return "follow" as const
  }
  if (event.kind === "groupMessage") {
    return "groupDiscussion" as const
  }
  return "joinGroup" as const
}

const contactSourceFor = (event: PersonEvent): ContactSource =>
  event.kind === "groupMessage"
    ? contactSources.enum.inboundMessage
    : contactSources.enum.direct

/**
 * The same person as the 1:1 bot chat (Telegram `from.id`, Zalo user id).
 * Creating a missing contact goes through the regular inbound path (MAC
 * quota, profile fetch) but stores no message and runs no automation.
 */
const resolveContactId = async (props: {
  inbox: InboxModel
  integrationRow: IntegrationRow
  event: PersonEvent
}): Promise<string | null> => {
  const incomingContact = toIncomingContact(props.event.user)
  if (isUndoEvent(props.event)) {
    const existing = await resolveExistingContactInbox({
      inbox: props.inbox,
      incomingContact,
    })
    return existing?.row.contactId ?? null
  }
  const detected = await detectContactAndConversation({
    inbox: props.inbox,
    integrationRow: props.integrationRow,
    incomingContact,
    source: contactSourceFor(props.event),
  })
  return detected.contactInbox.contactId
}

/**
 * Leaderboard scoring for one audience event. Toggle-style events (follow,
 * join) carry their own time in the sourceRef: following again after an
 * unfollow is a new event, scored again only after the unfollow took the
 * first one back.
 */
export const scoreAudienceEvent = async (props: {
  inbox: Pick<InboxModel, "id" | "workspaceId">
  contactId: string
  event: PersonEvent
}): Promise<void> => {
  const { inbox, contactId, event } = props
  const eventAt = new Date(event.occurredAt)
  const base = { workspaceId: inbox.workspaceId, contactId, inboxId: inbox.id }
  const toggleRef = `${event.user.sourceId}@${eventAt.getTime()}`

  switch (event.kind) {
    case "follow":
      await enqueueLeaderboardAward({
        ...base,
        rule: "follow",
        sourceRef: toggleRef,
        eventAt,
      })
      return
    case "unfollow":
      await enqueueLeaderboardReverse({
        ...base,
        rule: "follow",
        sourceRef: toggleRef,
        eventAt,
      })
      return
    case "groupJoin":
      await enqueueLeaderboardAward({
        ...base,
        rule: "joinGroup",
        sourceRef: `${event.chatId}:${toggleRef}`,
        eventAt,
        context: { chatId: event.chatId },
      })
      return
    case "groupLeave":
      await enqueueLeaderboardReverse({
        ...base,
        rule: "joinGroup",
        sourceRef: `${event.chatId}:${toggleRef}`,
        eventAt,
        context: { chatId: event.chatId },
      })
      return
    case "groupMessage":
      await enqueueLeaderboardAward({
        ...base,
        rule: "groupDiscussion",
        sourceRef: `${event.chatId}:${event.messageId}`,
        eventAt,
        context: { chatId: event.chatId, textLength: event.textLength },
      })
      return
    default: {
      const _exhaustive: never = event
      logger.warn({ event: _exhaustive }, "Unhandled audience event kind")
    }
  }
}

/**
 * Follow/unfollow, group join/leave, group messages and the bot's own group
 * membership. None of these is a 1:1 message, so nothing is stored in a
 * conversation and no bot automation runs.
 */
export const processChannelAudienceEvent = async (
  data: IntegrationJobChannelAudienceEvent["data"],
): Promise<void> => {
  const { inbox, integrationRow } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      data.integrationType as IntegrationType,
      data.integrationIdentifier,
    )
  const event = data.event

  if (event.kind === "botChatStatus") {
    await recordTelegramBotChatStatus({
      workspaceId: inbox.workspaceId,
      inboxId: inbox.id,
      chat: event.chat,
      status: event.status,
    })
    return
  }

  // Audience events exist only for leaderboard scoring. Check that a live
  // leaderboard on this inbox scores the rule BEFORE resolving the contact,
  // so a bot in a busy group does not mint a contact (and MAC usage) for
  // every member who posts.
  if (!(await inboxHasLeaderboardRule(inbox.id, ruleFor(event)))) {
    return
  }

  const contactId = await resolveContactId({ inbox, integrationRow, event })
  if (!contactId) {
    logger.debug(
      { inboxId: inbox.id, kind: event.kind },
      "Audience event for an unknown contact — nothing to undo",
    )
    return
  }
  await scoreAudienceEvent({ inbox, contactId, event })
}
