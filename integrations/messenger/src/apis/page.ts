import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { logger } from "../lib/logger"
import type {
  FacebookSendMessageRequest,
  FacebookSendMessageResponse,
  MessengerAuthValue,
} from "../schemas"

export const PAGE_SUBSCRIBE_SCOPES = [
  "messages",
  "messaging_postbacks",
  "messaging_optins",
  "message_reads",
  "messaging_referrals",
  "message_echoes",
  "messaging_customer_information",
  "messaging_feedback",
  "messaging_policy_enforcement",
  "feed",
  "inbox_labels",
  "live_videos",
  "standby",
]

export const exchangeLongLivedToken = async (
  settings: {
    clientId: string
    clientSecret: string
    version?: string
  },
  accessToken: string,
): Promise<string> => {
  const { version = DEFAULT_API_VERSION } = settings

  const res: { access_token: string } = await ky
    .get(`${API_URL}/${version}/oauth/access_token`, {
      searchParams: {
        grant_type: "fb_exchange_token",
        client_id: settings.clientId as string,
        client_secret: settings.clientSecret as string,
        fb_exchange_token: accessToken,
      },
    })
    .json()

  return res.access_token
}

export const subscribePageToAppWebhook = async (props: {
  pageId: string
  accessToken: string
  version?: string
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props

  await ky.post(`${API_URL}/${version}/${props.pageId}/subscribed_apps`, {
    json: {
      subscribed_fields: PAGE_SUBSCRIBE_SCOPES.join(","),
      access_token: props.accessToken,
    },
  })
}

export const unsubscribePageFromAppWebhook = async (props: {
  pageId: string
  accessToken: string
  version?: string
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props

  try {
    await ky
      .delete(`${API_URL}/${version}/${props.pageId}/subscribed_apps`, {
        searchParams: { access_token: props.accessToken },
      })
      .json()
  } catch (error) {
    logger.error("unsubscribePageFromAppWebhook error", error)
  }
}

export const sendMessage = async (
  auth: MessengerAuthValue,
  payload: FacebookSendMessageRequest,
): Promise<FacebookSendMessageResponse> => {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    return await ky
      .post(`${API_URL}/${version}/${auth.metadata.pageId}/messages`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
        json: payload,
      })
      .json()
  } catch (error) {
    logger.error("sendMessage error", error)

    throw new Error(`Facebook Graph API request failed: ${error}`)
  }
}
