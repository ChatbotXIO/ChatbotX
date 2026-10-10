import type { Oauth2AuthValue } from "@chatbotx.io/sdk"
import { ConnectionProviderRejectedError } from "@chatbotx.io/sdk"
import { getClient } from "./client"
import {
  type GoogleAdsUploadMethod,
  methodOfGrant,
  missingRequiredScopes,
  parseScopes,
  SCOPE_MISSING_MESSAGES,
} from "./lib/scopes"
import type { GoogleAdsAuthValue } from "./schemas"

/**
 * Adds the Google account identity, the upload method the grant was made for
 * and, when the platform has one, the developer token to the freshly exchanged
 * auth. The token lives only in the encrypted connect session (see
 * `stripDeveloperToken`) — it is never persisted.
 */
export const addGoogleAdsIdentity = async (
  baseAuth: Oauth2AuthValue,
  options: {
    developerToken?: string
    credentialMethod: GoogleAdsUploadMethod
  },
): Promise<GoogleAdsAuthValue> => {
  const tokenInfo = await getClient(baseAuth).getTokenInfo(
    baseAuth.tokens.accessToken,
  )
  const grantedScope =
    typeof baseAuth.metadata?.scope === "string"
      ? baseAuth.metadata.scope
      : undefined
  // The token response is authoritative; tokeninfo only backs it up.
  const granted = grantedScope
    ? parseScopes(grantedScope)
    : (tokenInfo.scopes ?? [])
  const uploadMethod = methodOfGrant(options.credentialMethod, granted)
  if (missingRequiredScopes(granted, uploadMethod).length > 0) {
    throw new ConnectionProviderRejectedError(
      SCOPE_MISSING_MESSAGES[uploadMethod],
      undefined,
      "scope_missing",
    )
  }
  const accountId = tokenInfo.sub ?? tokenInfo.user_id
  if (!accountId) {
    throw new Error("Google Ads token info has no stable account id")
  }
  return {
    ...baseAuth,
    metadata: {
      scope: grantedScope ?? granted.join(" "),
      accountId,
      email: tokenInfo.email,
      uploadMethod,
      ...(options.developerToken
        ? { developerToken: options.developerToken }
        : {}),
    },
  }
}

/** Candidate auth is what reaches the satellite row, so it must not carry the token. */
export const stripDeveloperToken = (
  auth: GoogleAdsAuthValue,
): GoogleAdsAuthValue => {
  const { developerToken: _developerToken, ...metadata } = auth.metadata
  return { ...auth, metadata }
}
