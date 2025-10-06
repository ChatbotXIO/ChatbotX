import {
  AuthType,
  type HandleRequestProps,
  type Oauth2Config,
  SdkException,
} from "@aha.chat/sdk"
import { convertCodeToTokens, getZaloOAProfile } from "../api/auth"
import type { ZaloAuthValue } from "../schemas/definition"

export const callbackHandler = async (
  props: HandleRequestProps<Oauth2Config>,
): Promise<ZaloAuthValue> => {
  const url = new URL(props.req.url)
  const code = url.searchParams.get("code")

  if (!code) {
    throw new SdkException("Code is required")
  }

  const { access_token, refresh_token, expires_in } = await convertCodeToTokens(
    props.config,
    code,
  )
  const oaProfile = await getZaloOAProfile(access_token)

  if (!oaProfile) {
    throw new SdkException("Can't get OA profile from Zalo")
  }

  return {
    authType: AuthType.OAUTH2,
    clientId: props.config.clientId,
    clientSecret: props.config.clientSecret as string,
    redirectUrl: `${process.env.NEXT_PUBLIC_BUILDER_URL}/integrations/zalo/callback`,
    tokens: {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_in,
    },
    oaId: oaProfile.oa_id,
    metadata: {
      version: props.config.version,
      oaName: oaProfile.name,
    },
  }
}
