import { AuthType, type HandleRequestProps, SdkException } from "@aha.chat/sdk"
import type { Credentials } from "google-auth-library"
import { getClient } from "../client"
import { googleSheetsLogger } from "../logger"
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
  let tokens: { tokens: Credentials }
  try {
    tokens = await client.getToken(code)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to exchange code for tokens"
    googleSheetsLogger.error(
      { err: error },
      "client.getToken failed: %s",
      message,
    )
    throw new SdkException(`OAuth token exchange failed: ${message}`)
  }

  return {
    authType: AuthType.oauth2,
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
