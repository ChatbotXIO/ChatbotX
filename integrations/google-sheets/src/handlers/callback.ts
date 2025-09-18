import { AuthType, type HandleRequestProps, SdkException } from "@aha.chat/sdk"
import { getClient } from "../client"
import type { GoogleSheetsAuthValue, GoogleSheetsConfig } from "../schemas"

export const callbackHandler = async (
  props: HandleRequestProps<GoogleSheetsConfig>,
): Promise<GoogleSheetsAuthValue> => {
  const url = new URL(props.req.url)
  const code = url.searchParams.get("code")
  if (!code) {
    throw new SdkException("Code is required")
  }

  const client = getClient(props.config)
  const tokens = await client.getToken(code)

  return {
    authType: AuthType.OAUTH2,
    clientId: props.config.clientId,
    clientSecret: props.config.clientSecret,
    redirectUrl: props.config.redirectUrl,
    tokens: {
      accessToken: tokens.tokens.access_token || "",
      expiresAt: new Date(tokens.tokens.expiry_date ?? "").toISOString(),
      refreshToken: tokens.tokens.refresh_token ?? null,
    },
    metadata: {
      scope: tokens.tokens.scope,
    },
  }
}
