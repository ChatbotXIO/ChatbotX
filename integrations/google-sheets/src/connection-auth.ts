import {
  googleTokensToAuth,
  type Oauth2AuthValue,
  type Oauth2Config,
} from "@chatbotx.io/sdk"
import { getClient } from "./client"
import type { GoogleSheetsAuthValue } from "./schemas"

export const addGoogleSheetsIdentity = async (
  baseAuth: Oauth2AuthValue,
): Promise<GoogleSheetsAuthValue> => {
  const tokenInfo = await getClient(baseAuth).getTokenInfo(
    baseAuth.tokens.accessToken,
  )
  const accountId = tokenInfo.sub ?? tokenInfo.user_id
  if (!accountId) {
    throw new Error("Google Sheets token info has no stable account id")
  }
  return {
    ...baseAuth,
    metadata: {
      scope:
        typeof baseAuth.metadata?.scope === "string"
          ? baseAuth.metadata.scope
          : undefined,
      accountId,
      email: tokenInfo.email,
    },
  }
}

export const googleSheetsTokensToAuth = async (
  config: Oauth2Config,
  callbackUrl: string,
  tokens: Parameters<typeof googleTokensToAuth>[2],
): Promise<GoogleSheetsAuthValue> =>
  await addGoogleSheetsIdentity(googleTokensToAuth(config, callbackUrl, tokens))
