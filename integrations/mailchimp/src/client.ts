import { AuthType, SdkException } from "@aha.chat/sdk"
import mailchimp from "@mailchimp/mailchimp_marketing"
import { MAILCHIMP_API_ENDPOINTS } from "./constants"
import type { MailchimpAuthValue, MailchimpConfig } from "./schemas"

export const getMailchimpClient = (auth: MailchimpAuthValue) => {
  mailchimp.setConfig({
    apiKey: auth.tokens.accessToken,
    server: auth.server,
  })
  return mailchimp
}

export const generateAuthUrl = (config: MailchimpConfig) => {
  const url = new URL(MAILCHIMP_API_ENDPOINTS.AUTHORIZE)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", config.redirectUrl)

  if (config.stateParams) {
    url.searchParams.set(
      "state",
      Buffer.from(JSON.stringify(config.stateParams)).toString("base64"),
    )
  }

  return url.toString()
}

export const exchangeCode = async (
  config: MailchimpConfig,
  code: string,
): Promise<MailchimpAuthValue> => {
  const response = await fetch(MAILCHIMP_API_ENDPOINTS.TOKEN, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUrl,
      code,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new SdkException(
      `Failed to exchange Mailchimp code: ${JSON.stringify(error)}`,
    )
  }

  const data = (await response.json()) as { access_token: string }
  const accessToken = data.access_token

  const metadataResponse = await fetch(MAILCHIMP_API_ENDPOINTS.METADATA, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!metadataResponse.ok) {
    throw new SdkException("Failed to fetch Mailchimp metadata")
  }

  const metadata = (await metadataResponse.json()) as { dc: string }

  return {
    authType: AuthType.oauth2,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUrl: config.redirectUrl,
    tokens: {
      accessToken,
    },
    server: metadata.dc,
  }
}
