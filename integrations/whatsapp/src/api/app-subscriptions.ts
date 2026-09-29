import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { logger } from "../lib/logger"

/**
 * App-level webhook subscription object types Meta accepts on GET|POST /{app-
 * id}/subscriptions.
 */
export const WHATSAPP_APP_SUBSCRIPTION_OBJECT = {
  WHATSAPP_BUSINESS_ACCOUNT: "whatsapp_business_account",
} as const

export type WhatsappAppSubscriptionObject =
  (typeof WHATSAPP_APP_SUBSCRIPTION_OBJECT)[keyof typeof WHATSAPP_APP_SUBSCRIPTION_OBJECT]

/**
 * App-level webhook fields relevant to WhatsApp calling. CALLS is required for
 * any call webhook (call_created, terminate, …) to reach our endpoint.
 * ACCOUNT_SETTINGS_UPDATE is optional and always subscribed in a separate
 * request so a failure there can never block CALLS.
 */
export const WHATSAPP_APP_WEBHOOK_FIELDS = {
  CALLS: "calls",
  ACCOUNT_SETTINGS_UPDATE: "account_settings_update",
} as const

export type WhatsappAppWebhookField =
  (typeof WHATSAPP_APP_WEBHOOK_FIELDS)[keyof typeof WHATSAPP_APP_WEBHOOK_FIELDS]

export type WhatsappAppSubscriptionField = {
  name: string
  version?: string
}

export type WhatsappAppSubscription = {
  object: string
  callback_url: string
  fields: WhatsappAppSubscriptionField[]
  active: boolean
}

type AppWebhookSubscriptionsResponse = {
  data: WhatsappAppSubscription[]
}

function buildAppAccessToken(appId: string, appSecret: string): string {
  return `${appId}|${appSecret}`
}

/**
 * GET /{app-id}/subscriptions — the app-level webhook subscriptions configured
 * in the App Dashboard, one entry per subscribed object.
 */
export function getAppWebhookSubscriptions({
  appId,
  appSecret,
  version = DEFAULT_API_VERSION,
}: {
  appId: string
  appSecret: string
  version?: string
}): Promise<WhatsappAppSubscription[]> {
  return rescue(async () => {
    const result = await ky
      .get<AppWebhookSubscriptionsResponse>(
        `${API_URL}/${version}/${appId}/subscriptions`,
        {
          headers: {
            Authorization: `Bearer ${buildAppAccessToken(appId, appSecret)}`,
          },
        },
      )
      .json()

    return result.data
  })
}

function postAppWebhookFields({
  appId,
  appSecret,
  version,
  object,
  fields,
  callbackUrl,
  verifyToken,
}: {
  appId: string
  appSecret: string
  version: string
  object: string
  fields: string[]
  callbackUrl: string
  verifyToken: string
}): Promise<void> {
  return rescue(async () => {
    await ky
      .post(`${API_URL}/${version}/${appId}/subscriptions`, {
        headers: {
          Authorization: `Bearer ${buildAppAccessToken(appId, appSecret)}`,
        },
        json: {
          object,
          callback_url: callbackUrl,
          fields: fields.join(","),
          verify_token: verifyToken,
        },
      })
      .json()
  })
}

function unionFields(
  current: string[],
  additions: readonly string[],
): string[] {
  const merged = new Set(current)
  for (const field of additions) {
    merged.add(field)
  }
  return Array.from(merged)
}

export type EnsureAppWebhookFieldsStatus =
  | "already-subscribed"
  | "subscribed"
  | "no-subscription"

export type EnsureAppWebhookFieldsResult = {
  status: EnsureAppWebhookFieldsStatus
  fields: string[]
}

/**
 * Adds requiredFields/optionalFields without dropping fields already
 * subscribed by someone else. The POST's callback_url always mirrors the
 * GET's; when GET reports no subscription, this never invents a callback URL
 * — the caller must direct the user to configure the webhook in App Dashboard.
 */
export async function ensureAppWebhookFields({
  appId,
  appSecret,
  verifyToken,
  object,
  requiredFields,
  optionalFields = [],
  version = DEFAULT_API_VERSION,
}: {
  appId: string
  appSecret: string
  verifyToken: string
  object: string
  requiredFields: readonly string[]
  optionalFields?: readonly string[]
  version?: string
}): Promise<EnsureAppWebhookFieldsResult> {
  const subscriptions = await getAppWebhookSubscriptions({
    appId,
    appSecret,
    version,
  })
  const existing = subscriptions.find(
    (subscription) => subscription.object === object,
  )

  if (!existing) {
    return { status: "no-subscription", fields: [] }
  }

  const existingFieldNames = existing.fields.map((field) => field.name)
  const missingRequired = requiredFields.filter(
    (field) => !existingFieldNames.includes(field),
  )

  let fields = existingFieldNames
  let status: EnsureAppWebhookFieldsStatus = "already-subscribed"

  if (missingRequired.length > 0) {
    fields = unionFields(existingFieldNames, requiredFields)
    await postAppWebhookFields({
      appId,
      appSecret,
      version,
      object,
      fields,
      callbackUrl: existing.callback_url,
      verifyToken,
    })
    status = "subscribed"
  }

  const missingOptional = optionalFields.filter(
    (field) => !fields.includes(field),
  )
  if (missingOptional.length > 0) {
    const fieldsWithOptional = unionFields(fields, optionalFields)
    try {
      await postAppWebhookFields({
        appId,
        appSecret,
        version,
        object,
        fields: fieldsWithOptional,
        callbackUrl: existing.callback_url,
        verifyToken,
      })
      fields = fieldsWithOptional
    } catch (error) {
      // Optional field subscription failure must never fail the required
      // subscription's result. Log only the message, never the raw error:
      // rescue attaches the origin ky HTTPError (which can carry the
      // Authorization header) as originError, an enumerable own property a
      // generic logger would serialize.
      logger.warn(
        { message: error instanceof Error ? error.message : String(error) },
        "Optional app webhook field subscription failed",
      )
    }
  }

  return { status, fields }
}
