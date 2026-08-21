import {
  AuthType,
  type HandleRequestProps,
  SdkException,
} from "@chatbotx.io/sdk"
import { verifyCalendarAccess } from "../apis/calendars"
import { getClient } from "../client"
import { handleError } from "../error"
import type { GoogleCalendarAuthValue, GoogleCalendarConfig } from "../schemas"

export const callbackHandler = async (
  props: HandleRequestProps<GoogleCalendarConfig>,
): Promise<GoogleCalendarAuthValue> => {
  const url = new URL(props.req.url)
  const code = url.searchParams.get("code")
  if (!code) {
    throw new SdkException("Code is required")
  }

  try {
    const client = getClient(props.config)
    const tokens = await client.getToken(code)
    const auth: GoogleCalendarAuthValue = {
      authType: AuthType.oauth2,
      clientId: props.config.clientId,
      clientSecret: props.config.clientSecret,
      redirectUrl: props.config.redirectUrl,
      tokens: {
        accessToken: tokens.tokens.access_token || "",
        expiresAt: tokens.tokens.expiry_date
          ? new Date(tokens.tokens.expiry_date).toISOString()
          : undefined,
        refreshToken: tokens.tokens.refresh_token ?? null,
      },
      metadata: {
        scope: tokens.tokens.scope,
      },
    }
    const calendar = await verifyCalendarAccess(auth, "primary")

    return {
      ...auth,
      metadata: {
        ...auth.metadata,
        ...calendar,
      },
    }
  } catch (error) {
    return handleError(error, "callbackHandler")
  }
}
