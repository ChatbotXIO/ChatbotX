import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { SdkException } from "@chatbotx.io/sdk"
import { exchangeCodeForToken } from "../apis/auth"
import { getUserInfo } from "../apis/user"
import { parseTiktokScopes } from "../lib/scopes"
import { buildTokenTimestamps } from "../lib/token-utils"
import type { TiktokAuthValue, TiktokConfig } from "../schema"

export const callbackHandler = async (
  props: HandleRequestProps<TiktokConfig>,
): Promise<TiktokAuthValue> => {
  const url = new URL(props.req.url)
  const code = url.searchParams.get("code")

  if (!code?.trim()) {
    throw new SdkException("Missing code parameter in TikTok callback")
  }

  const { clientId, clientSecret, redirectUrl } = props.config

  if (!(clientId && clientSecret && redirectUrl)) {
    throw new SdkException("Missing TikTok app credentials in config")
  }

  const tokenResponse = await exchangeCodeForToken(
    { clientId, clientSecret, redirectUrl },
    code,
  )

  const userInfo = await getUserInfo({
    accessToken: tokenResponse.access_token,
  })

  return {
    authType: "oauth2",
    clientId,
    clientSecret,
    redirectUrl,
    tokens: {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      ...buildTokenTimestamps(
        tokenResponse.expires_in,
        tokenResponse.refresh_expires_in,
      ),
    },
    metadata: {
      openId: tokenResponse.open_id,
      username: userInfo.username,
      displayName: userInfo.display_name,
      // Recorded so the settings list can tell an account that authorized
      // before comment automation shipped from one that carries the scopes
      // comment events need. See `tiktokNeedsReauthorization`.
      scopes: parseTiktokScopes(tokenResponse.scope),
    },
  }
}
