import { contactInboxService } from "@chatbotx.io/business"
import type { LeaderboardFollowerCheck } from "@chatbotx.io/business/leaderboard"
import type { LeaderboardModel } from "@chatbotx.io/database/types"
import {
  getTelegramChatMemberStatus,
  isTelegramMemberStatus,
  type TelegramAuthValue,
} from "@chatbotx.io/integration-telegram"
import { integration as integrationZalo } from "@chatbotx.io/integration-zalo"
import type { ZaloAuthValue } from "@chatbotx.io/integration-zalo/schema"
import { toLogSafeError } from "@chatbotx.io/logger"
import { withCache } from "@chatbotx.io/redis"
import type { Context } from "@chatbotx.io/sdk"
import { logger } from "../lib/logger"
import { resolveIntegrationContextFromContactInbox } from "../services/integrations"

/** A follower answer is reused for 10 minutes per (inbox, contact[, chat]). */
const FOLLOWER_CACHE_SECONDS = 10 * 60

type FollowerTarget = {
  workspaceId: string
  inboxId: string
  contactId: string
  /** The contact's id on the channel (IGSID, Zalo user id, Telegram user id). */
  sourceId: string
  channel: string
}

const cachedAnswer = (key: string, check: () => Promise<boolean>) =>
  withCache(`leaderboard:follower:${key}`, check, {
    ttl: FOLLOWER_CACHE_SECONDS,
  })

const resolveChannelContext = (target: FollowerTarget) =>
  resolveIntegrationContextFromContactInbox({
    workspaceId: target.workspaceId,
    contactInbox: { channel: target.channel, inboxId: target.inboxId },
  })

const isInstagramFollower = async (
  target: FollowerTarget,
): Promise<boolean> => {
  const { integration, ctx } = await resolveChannelContext(target)
  const snapshot = await integration.runChannelHandler(
    "contact",
    "getProfileSnapshot",
    { ctx, data: { sourceId: target.sourceId } },
  )
  // Instagram omits the field when it cannot tell; don't punish the player.
  return snapshot.followsBusiness !== false
}

const isZaloFollower = async (target: FollowerTarget): Promise<boolean> => {
  const { ctx } = await resolveChannelContext(target)
  const detail = await integrationZalo.runAction("getUserDetail", {
    ctx: ctx as unknown as Context<ZaloAuthValue>,
    userId: target.sourceId,
  })
  return detail.user_is_follower !== false
}

/** A member of ANY configured group/channel counts; no configured chat = no filter. */
const isTelegramMember = async (
  target: FollowerTarget,
  chatIds: readonly string[],
): Promise<boolean> => {
  if (chatIds.length === 0) {
    return true
  }
  const { ctx } = await resolveChannelContext(target)
  const auth = ctx.auth as unknown as TelegramAuthValue
  for (const chatId of chatIds) {
    const isMember = await cachedAnswer(
      `${target.inboxId}:${target.contactId}:${chatId}`,
      async () => {
        const member = await getTelegramChatMemberStatus(auth, {
          chatId,
          userId: target.sourceId,
        })
        return isTelegramMemberStatus(member.status, member.isMember)
      },
    )
    if (isMember) {
      return true
    }
  }
  return false
}

const checkFollower = async (
  target: FollowerTarget,
  leaderboard: LeaderboardModel,
): Promise<boolean> => {
  const key = `${target.inboxId}:${target.contactId}`
  switch (leaderboard.platform) {
    case "instagram":
      return await cachedAnswer(key, () => isInstagramFollower(target))
    case "zalo":
      return await cachedAnswer(key, () => isZaloFollower(target))
    case "telegram":
      return await isTelegramMember(target, leaderboard.scope.telegramChatIds)
    default:
      return true
  }
}

/**
 * Builds the "does this contact follow the host account" check used by
 * leaderboards with `followersOnly` (Instagram followers, Zalo OA followers,
 * Telegram channel/group members). The scoring service only calls it for
 * those platforms. Returns undefined when there is no inbox to check against,
 * in which case the filter is not applied.
 *
 * Each answer is cached for 10 minutes. A failed channel call counts as a
 * follower (and is not cached): an outage on our side or the channel's must
 * not cost players their points.
 */
export function buildLeaderboardFollowerCheck(input: {
  workspaceId: string
  contactId: string
  inboxId: string | null | undefined
}): LeaderboardFollowerCheck | undefined {
  const { inboxId } = input
  if (!inboxId) {
    return
  }
  return async (leaderboard) => {
    try {
      const contactInbox = await contactInboxService.findBy({
        where: { inboxId, contactId: input.contactId },
      })
      if (!contactInbox?.sourceId) {
        return true
      }
      return await checkFollower(
        {
          workspaceId: input.workspaceId,
          inboxId,
          contactId: input.contactId,
          sourceId: contactInbox.sourceId,
          channel: contactInbox.channel,
        },
        leaderboard,
      )
    } catch (err) {
      logger.warn(
        {
          err: toLogSafeError(err),
          leaderboardId: leaderboard.id,
          inboxId,
          contactId: input.contactId,
        },
        "leaderboard follower check failed; counting the contact as a follower",
      )
      return true
    }
  }
}
