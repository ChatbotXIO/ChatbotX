import "server-only"
import type { MinigameModel } from "@chatbotx.io/database/types"
import { signMinigameReferralToken } from "@chatbotx.io/encryption/minigame-referral-token"
import { getOriginFromHeader } from "@/lib/domain"

const SHARE_URL_PLACEHOLDER = "{{shareUrl}}"

export type MinigameShare = {
  inviteUrl: string
  message: string
}

/**
 * Builds what the play screen's Share button copies: an invite link carrying
 * a freshly-signed *referral* token (never the player's own play token,
 * which would let the recipient play as them), wrapped in the workspace's
 * configured share message.
 *
 * Must run on the server: the token needs the server signing key, and an
 * origin taken from the browser would be attacker-controllable inside the
 * copied text.
 */
export async function buildMinigameShare(props: {
  minigame: MinigameModel
  contactId: string
}): Promise<MinigameShare> {
  const referralToken = await signMinigameReferralToken({
    workspaceId: props.minigame.workspaceId,
    minigameId: props.minigame.id,
    referrerContactId: props.contactId,
  })

  // The current request's public origin, not `getBrokerOrigin()`: the player
  // may be on a tenant's custom domain, and the invite has to be same-origin
  // with this page or the referral cookie's path/domain won't line up.
  const origin = await getOriginFromHeader()
  const inviteUrl = `${origin}/minigames/invite?minigameId=${props.minigame.id}&ref=${referralToken}`

  const template = props.minigame.generalSettings.shareMessage?.trim()
  if (!template) {
    return { inviteUrl, message: inviteUrl }
  }

  // A workspace can save a share message that dropped the placeholder; append
  // the link rather than handing the player text with no link in it at all.
  const message = template.includes(SHARE_URL_PLACEHOLDER)
    ? template.replaceAll(SHARE_URL_PLACEHOLDER, inviteUrl)
    : `${template}\n${inviteUrl}`

  return { inviteUrl, message }
}
