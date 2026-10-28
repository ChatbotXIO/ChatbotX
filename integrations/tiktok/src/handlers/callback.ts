import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { SdkException } from "@chatbotx.io/sdk"
import { exchangeCodeForToken } from "../apis/auth"
import { getUserInfo } from "../apis/user"
import { assertTiktokGrant } from "../lib/scopes"
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

  // TikTok's consent screen lets a user untick individual permissions, so a
  // partial grant arrives here looking exactly like a successful one. Checked
  // before `getUserInfo` and before anything is persisted — the integration row
  // is only written after this handler resolves, so refusing here leaves no
  // half-connected channel behind.
  //
  // Only the scopes the credential's features require are refused. With
  // messaging on, a grant missing just the comment-automation scopes still
  // gives a working DM inbox, and rejecting it would leave a workspace that
  // only wants DMs unable to connect at all; that case surfaces as the
  // re-authorize warning on the settings list instead.
  const grant = assertTiktokGrant(tokenResponse.scope, props.config.features)

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
      scopes: grant.scopes,
      features: grant.features,
    },
  }
}
