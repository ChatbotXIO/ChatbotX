import { authAccountRepository } from "@chatbotx.io/database/repositories"
import {
  debugToken,
  getFacebookUser,
  MESSENGER_REUSE_REQUIRED_SCOPES,
  toAppAccessToken,
} from "@chatbotx.io/integration-messenger"

export type FacebookSsoReuse =
  | {
      reusable: true
      userToken: string
      userId?: string
      userName?: string
      userAvatarUrl?: string
    }
  | { reusable: false }

/**
 * Whether the current user's Facebook SSO login (see `upgrade-facebook-account.ts`)
 * already carries every permission the Messenger connect flow would otherwise
 * request, so "Connect" can skip straight to the Page picker instead of
 * round-tripping through Facebook's OAuth dialog again.
 *
 * Validates against the workspace's CURRENT `messenger` credential (the same
 * one `resolveForOwner` always returns) rather than whichever app minted the
 * token — if the reseller ever rotates their Meta app secret, this simply
 * fails closed (falls back to the full OAuth flow) until the user's next
 * Facebook SSO login re-mints against the new app.
 */
export async function tryReuseFacebookSsoToken(props: {
  userId: string
  messengerCredential: {
    clientId: string
    clientSecret: string
    version: string
  }
}): Promise<FacebookSsoReuse> {
  const account = await authAccountRepository.findByUserAndProvider({
    userId: props.userId,
    providerId: "facebook",
  })
  if (!account?.accessToken) {
    return { reusable: false }
  }

  const debug = await debugToken({
    inputToken: account.accessToken,
    appAccessToken: toAppAccessToken(props.messengerCredential),
    version: props.messengerCredential.version,
  }).catch(() => null)

  if (!debug?.is_valid) {
    return { reusable: false }
  }

  const grantedScopes = debug.scopes ?? []
  const hasAllRequiredScopes = MESSENGER_REUSE_REQUIRED_SCOPES.every((scope) =>
    grantedScopes.includes(scope),
  )
  if (!hasAllRequiredScopes) {
    return { reusable: false }
  }

  const fbUser = await getFacebookUser(
    account.accessToken,
    props.messengerCredential.version,
  ).catch(() => undefined)

  return {
    reusable: true,
    userToken: account.accessToken,
    userId: fbUser?.id,
    userName: fbUser?.name,
    userAvatarUrl: fbUser?.avatarUrl,
  }
}
