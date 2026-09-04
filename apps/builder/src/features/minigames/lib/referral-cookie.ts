import "server-only"
import { verifyMinigameReferralToken } from "@chatbotx.io/encryption/minigame-referral-token"
import { cookies } from "next/headers"

/**
 * Matches the referral token's own TTL so the cookie and the token it holds
 * expire together — a cookie that outlives its token would only ever produce
 * a silent verification failure.
 */
export const MINIGAME_REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60

/**
 * Namespaced per minigame: with a single global cookie name, an invite to
 * one minigame would silently destroy a pending invite to another.
 */
export function minigameReferralCookieName(minigameId: string): string {
  return `mg_ref_${minigameId}`
}

/**
 * Reads the pending invite for this minigame and returns the referrer it
 * names, or `null` when there is no cookie, the token is tampered/expired,
 * or it was minted for a different minigame or workspace.
 *
 * The cookie stores the raw signed token rather than a bare contact id
 * precisely so that a forged cookie fails verification here instead of being
 * trusted as an identity.
 */
export async function readMinigameReferrerContactId(props: {
  minigameId: string
  workspaceId: string
}): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(
    minigameReferralCookieName(props.minigameId),
  )?.value
  if (!token) {
    return null
  }

  const payload = await verifyMinigameReferralToken(token).catch(() => null)
  if (
    !payload ||
    payload.minigameId !== props.minigameId ||
    payload.workspaceId !== props.workspaceId
  ) {
    return null
  }

  return payload.referrerContactId
}
