import "server-only"
import { inboxService, resolveTenantSettings } from "@chatbotx.io/business"
import { buildInboxLink, canShareMinigame } from "@chatbotx.io/business/utils"
import type { ChannelType } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  MinigameModel,
} from "@chatbotx.io/database/types"

/**
 * The URL the play screen's Share button copies: a ref link for the very
 * channel this player is playing on, e.g.
 * `https://m.me/<pageId>?ref=mg_<minigameId>_<contactId>`. A friend who taps
 * it opens that same channel, its webhook extracts the ref, and `runRef`
 * both runs the minigame's Sharing Node and credits this player.
 *
 * Returns `null` (hiding the button) in four cases, each for its own reason:
 *  - no Sharing Node configured  → sharing is switched off
 *  - no contact inbox            → nothing identifies the player's channel
 *  - the channel can't be shared → it drops refs (the link would look right
 *    but never credit), or it is `webchat`, whose anonymous visitors make
 *    the link self-farmable — see `MINIGAME_SHARE_CHANNELS`
 *  - no link could be built      → the channel has no deep link (smtp/api)
 *
 * Server-only: the ref must be minted here, and `buildInboxLink` needs the
 * workspace's own `appUrl` rather than anything the browser could supply.
 */
export async function buildMinigameShareUrl(props: {
  minigame: MinigameModel
  contactId: string
  contactInbox: ContactInboxModel | undefined
}): Promise<string | null> {
  const { minigame, contactId, contactInbox } = props

  // Legacy `playerSettings` jsonb has no such key despite the drizzle `$type`.
  if (!(minigame.playerSettings.sharingNodeId && contactInbox)) {
    return null
  }

  if (!canShareMinigame(contactInbox.channel as ChannelType)) {
    return null
  }

  const inbox = await inboxService.findWithIntegrationsById({
    id: contactInbox.inboxId,
  })
  // `findWithIntegrationsById` is not workspace-scoped. The `inboxId` comes
  // from an already-verified play token so it is trusted, but cross-check it
  // anyway rather than relying on that one step upstream.
  if (!inbox || inbox.workspaceId !== minigame.workspaceId) {
    return null
  }

  // `appUrl` is only consumed by `buildInboxLink`'s webchat branch.
  const { appUrl } = await resolveTenantSettings({
    workspaceId: minigame.workspaceId,
  })

  return (
    buildInboxLink(appUrl, inbox, {
      type: "minigame-share",
      minigameId: minigame.id,
      referrerContactId: contactId,
    }) ?? null
  )
}
