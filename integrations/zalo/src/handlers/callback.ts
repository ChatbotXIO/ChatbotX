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

  if (!code?.trim()) {
    throw new SdkException("Code parameter is required and cannot be empty")
  }

  if (!props.config.clientSecret) {
    throw new SdkException("Client secret is required for authentication")
  }

  const { access_token, refresh_token, expires_in } = await convertCodeToTokens(
    props.config,
    code,
  )

  if (!access_token) {
    throw new SdkException("Access token not received from Zalo")
  }

  if (!refresh_token) {
    throw new SdkException("Refresh token not received from Zalo")
  }

  const oaProfile = await getZaloOAProfile(access_token)

  if (!oaProfile?.oa_id) {
    throw new SdkException("Invalid OA profile received from Zalo")
  }

  const builderUrl = process.env.NEXT_PUBLIC_BUILDER_URL
  if (!builderUrl) {
    throw new SdkException(
      "NEXT_PUBLIC_BUILDER_URL environment variable is not set",
    )
  }

  return {
    authType: AuthType.oauth2,
    clientId: props.config.clientId,
    clientSecret: props.config.clientSecret,
    redirectUrl: `${builderUrl}/integrations/zalo/callback`,
    tokens: {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: calculateExpiresAt(expires_in),
    },
    oaId: oaProfile.oa_id,
    metadata: {
      version: props.config.version,
      oaName: oaProfile.name,
    },
  }
}

function calculateExpiresAt(expiresIn: number): string {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresIn * 1000)

  return expiresAt.toISOString()
}
