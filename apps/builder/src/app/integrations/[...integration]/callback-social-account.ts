import { socialAccountService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type SocialAccountProvider,
  socialAccountProviders,
} from "@chatbotx.io/channel-registry/social-account"
import {
  SOCIAL_CONNECT_SUCCESS,
  type SocialConnectResult,
  socialConnectFailure,
} from "@/features/social-accounts/lib/social-connect-result"
import { SOCIAL_ACCOUNT_OAUTH_FLOW } from "@/features/social-accounts/lib/start-social-account-oauth"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { logger } from "@/lib/log"
import { consumeOAuthNonce, matchesOAuthNonce } from "@/lib/oauth-state-nonce"

type ProviderCredentialConfig = {
  clientId: string
  clientSecret: string
  version?: string
}

/**
 * The callback a publishing connect returns to. Only TikTok keeps a separate
 * publishing login (its own app); Facebook, Instagram and Threads publish with
 * the inbox token and have no publishing connect.
 */
const SOCIAL_ACCOUNT_CALLBACK_PROVIDER: Record<
  string,
  SocialAccountProvider | undefined
> = {
  tiktok: "tiktok",
}

/**
 * Whether a `socialAccount` state belongs to this callback. A state naming a
 * network other than the callback's own (or arriving at a channel with no
 * publishing connect, such as Messenger or Instagram) must never
 * run as a normal channel connect.
 */
export const isOwnSocialAccountCallback = (
  integrationType: string,
  state: { socialProvider?: string },
): boolean =>
  SOCIAL_ACCOUNT_CALLBACK_PROVIDER[integrationType] === state.socialProvider

/** What the callback does with the outcome: a 404 for a forged state, a redirect otherwise. */
export type SocialConnectOutcome = {
  notFound: boolean
  result: SocialConnectResult
}

const NOT_FOUND: SocialConnectOutcome = {
  notFound: true,
  result: socialConnectFailure("notFound"),
}

const outcome = (result: SocialConnectResult): SocialConnectOutcome => ({
  notFound: false,
  result,
})

/** The permission names a `permissionNotGranted` exception carries, as the platform spelled them. */
const missingPermissionsOf = (error: ChatbotXException): string[] =>
  (error.data?.permissions?.toString() ?? "").split(", ").filter(Boolean)

/**
 * What a `?error=` callback of the publishing connect reports. The state is
 * attacker-forgeable, so the single-use nonce is only spent, and the attempt
 * only reported as cancelled, when the state's nonce matches the browser's
 * cookie; a forged cancel leaves the victim's in-progress connect intact.
 */
export async function cancelSocialAccountConnect(state: {
  nonce?: string
}): Promise<SocialConnectResult> {
  if (!(await matchesOAuthNonce(state.nonce))) {
    return socialConnectFailure("sessionExpired")
  }
  // The cancelled attempt is over: drop the nonce so it cannot be replayed.
  await consumeOAuthNonce(state.nonce)
  return socialConnectFailure("cancelled")
}

/**
 * Finishes the publishing connect for the OAuth callback.
 *
 * The callback is an API boundary and `state` is attacker-forgeable (base64 JSON
 * round-tripped through the platform), so before any provider call this proves,
 * in order: the state names this callback's network and carries a nonce; the
 * browser holds the single-use nonce issued when Connect was pressed; the caller
 * is a super admin of the workspace. Only then it exchanges the code and stores
 * the identity, granted permissions and destinations exactly as the platform
 * answered — nothing from `state` beyond the workspace and network is trusted.
 * It creates no inbox, integration or messaging webhook.
 */
export async function completeSocialAccountConnect(input: {
  callbackUrl: string
  code: string
  credentialConfig: ProviderCredentialConfig
  provider: SocialAccountProvider
  request: { ipAddress: string; userAgent: string | undefined }
  state: { flow?: string; nonce?: string; socialProvider?: string }
  userId: string
  workspaceId: string
}): Promise<SocialConnectOutcome> {
  const { provider, state, userId, workspaceId } = input

  if (
    state.flow !== SOCIAL_ACCOUNT_OAUTH_FLOW ||
    state.socialProvider !== provider ||
    !state.nonce
  ) {
    logger.debug(
      { workspaceId, provider },
      "socialAccount OAuth state is incomplete",
    )
    return NOT_FOUND
  }
  // The caller already passed the session and membership checks, so a missing
  // nonce is almost always a legitimate admin whose cookie expired or was
  // replaced by a second Connect in another tab: answer with a result (a redirect
  // that also carries the cookie deletion), not a bare 404.
  if (!(await consumeOAuthNonce(state.nonce))) {
    logger.info(
      { workspaceId, userId, provider },
      "socialAccount OAuth callback without the matching nonce cookie",
    )
    return outcome(socialConnectFailure("sessionExpired"))
  }
  try {
    await assertWorkspaceSuperAdmin(workspaceId)
  } catch {
    logger.info(
      { workspaceId, userId, provider },
      "socialAccount OAuth callback: non-super-admin blocked",
    )
    return NOT_FOUND
  }

  const adapter = socialAccountProviders[provider]
  try {
    const account = await adapter.connect({
      callbackUrl: input.callbackUrl,
      code: input.code,
      settings: input.credentialConfig,
    })
    await socialAccountService.connect({
      account,
      connectedById: userId,
      workspaceId,
    })
  } catch (error) {
    if (
      error instanceof ChatbotXException &&
      error.code === "permissionNotGranted"
    ) {
      return outcome(
        socialConnectFailure(
          "permissionNotGranted",
          missingPermissionsOf(error),
        ),
      )
    }
    logger.error(
      { err: error, workspaceId, provider },
      "social account connect failed",
    )
    return outcome(
      socialConnectFailure(
        adapter.requiresReconnect(error) ? "sessionExpired" : "failed",
      ),
    )
  }

  await auditService.record({
    action: "update",
    detail: `connected a ${provider} account for publishing`,
    ipAddress: input.request.ipAddress,
    userAgent: input.request.userAgent,
    userId,
    workspaceId,
  })
  return outcome(SOCIAL_CONNECT_SUCCESS)
}
