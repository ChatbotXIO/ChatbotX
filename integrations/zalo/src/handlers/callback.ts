import { AuthType, type HandleRequestProps, SdkException } from "@aha.chat/sdk"
import { convertCodeToTokens, getZaloOAProfile } from "../libs/zalo"
import type { ZaloAuthValue, ZaloConfig } from "../schemas"

export const callbackHandler = async (
  props: HandleRequestProps<ZaloConfig>,
): Promise<ZaloAuthValue> => {
  const url = new URL(props.req.url)
  const code = url.searchParams.get("code")

  if (!code) {
    throw new SdkException("Code is required")
  }

  const { access_token, refresh_token, expires_in } = await convertCodeToTokens(
    code,
    props.config,
  )
  const OAProfile = await getZaloOAProfile(access_token)

  if (!OAProfile) {
    throw new SdkException("Can't get OA profile from Zalo")
  }

  return {
    authType: AuthType.OAUTH2,
    clientId: props.config.clientId,
    clientSecret: props.config.clientSecret as string,
    redirectUri: `${process.env.NEXT_PUBLIC_BUILDER_URL}/integrations/zalo/callback`,
    tokens: {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_in,
    },
    oaId: OAProfile.oa_id,
    metadata: {
      version: props.config.version,
      OAName: OAProfile.name,
    },
  }
}
