import type { Oauth2AuthValue } from "@chatbotx.io/sdk"
import { OAuth2Client } from "google-auth-library"
import type { GoogleAdsConfig } from "./schemas"

export function getClient(props: GoogleAdsConfig | Oauth2AuthValue) {
  const client = new OAuth2Client(
    props.clientId,
    props.clientSecret,
    props.redirectUrl,
  )

  if ("tokens" in props) {
    client.setCredentials({
      access_token: props.tokens.accessToken,
      expiry_date: props.tokens.expiresAt
        ? new Date(props.tokens.expiresAt).getTime()
        : null,
      refresh_token: props.tokens.refreshToken,
    })
  }

  return client
}
