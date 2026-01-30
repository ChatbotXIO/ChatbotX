import { AuthType, SdkException } from "@aha.chat/sdk"
import mailchimp from "@mailchimp/mailchimp_marketing"
import ky, { HTTPError } from "ky"
import { z } from "zod"
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
  try {
    const data = await ky
      .post(MAILCHIMP_API_ENDPOINTS.TOKEN, {
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUrl,
          code,
        }),
      })
      .json()

    const accessToken = z
      .object({ access_token: z.string() })
      .parse(data).access_token

    const metadataResponse = await ky
      .get(MAILCHIMP_API_ENDPOINTS.METADATA, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      .json()

    const metadata = z.object({ dc: z.string() }).parse(metadataResponse)

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
  } catch (error) {
    const err = error as Error | HTTPError
    if (err instanceof HTTPError) {
      const errorData = (await err.response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >
      throw new SdkException(
        `Failed to exchange Mailchimp code: ${JSON.stringify(errorData)}`,
      )
    }

    if (err instanceof z.ZodError) {
      throw new SdkException(
        `Failed to parse Mailchimp response: ${err.message}`,
      )
    }

    throw err
  }
}
