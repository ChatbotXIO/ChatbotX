import "server-only"
import {
  contactInboxService,
  inboxService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import { buildInboxLink, canShareMinigame } from "@chatbotx.io/business/utils"
import type { ChannelType } from "@chatbotx.io/database/partials"
import type { LeaderboardModel } from "@chatbotx.io/database/types"

/**
 * The URL the "Share to earn points" button shares: a ref link for the
 * channel this viewer is on, e.g. `https://m.me/<pageId>?ref=lb_<id>_<contact>`.
 * A friend who opens it reaches the bot, `runRef` adds them to the
 * leaderboard and credits this viewer (see `creditReferral`).
 *
 * null (button hidden) when the referral rule is off, the leaderboard is on
 * email (no chat to land in), the viewer's channel drops refs or is webchat
 * (self-farmable, same reasoning as `MINIGAME_SHARE_CHANNELS`), or no deep
 * link exists for the channel.
 */
export async function buildLeaderboardShareUrl(props: {
  leaderboard: LeaderboardModel
  contactId: string
  contactInboxId: string
}): Promise<string | null> {
  const { leaderboard } = props
  if (
    !leaderboard.rules.referral?.enabled ||
    leaderboard.platform === "email"
  ) {
    return null
  }
  const contactInbox = await contactInboxService.findBy({
    where: { id: props.contactInboxId },
  })
  if (
    !(contactInbox && canShareMinigame(contactInbox.channel as ChannelType))
  ) {
    return null
  }
  const inbox = await inboxService.findWithIntegrationsById({
    id: contactInbox.inboxId,
  })
  // Not workspace-scoped: the id came from a verified token, but cross-check.
  if (!inbox || inbox.workspaceId !== leaderboard.workspaceId) {
    return null
  }
  const { appUrl } = await resolveTenantSettings({
    workspaceId: leaderboard.workspaceId,
  })
  return (
    buildInboxLink(appUrl, inbox, {
      type: "leaderboard",
      leaderboardId: leaderboard.id,
      contactId: props.contactId,
    }) ?? null
  )
}
