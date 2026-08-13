import ky from "ky"
import { z } from "zod"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import {
  type ChannelErrorSource,
  parseOriginError,
  rescue,
  WhatsappException,
} from "../exception"

const datasetIdResponseSchema = z.union([
  z.object({ id: z.string().trim().min(1) }),
  z.object({ dataset_id: z.string().trim().min(1) }),
  z.object({
    data: z.object({ id: z.string().trim().min(1) }),
  }),
  z.object({
    dataset: z.object({ id: z.string().trim().min(1) }),
  }),
])

const eventTypeToMetaEventName = {
  lead: "LeadSubmitted",
  purchase: "Purchase",
} as const satisfies Record<ConversionEventInput["eventType"], string>

const conversionEventsResponseSchema = z.object({}).passthrough()

export type ConversionEventInput = {
  eventType: "lead" | "purchase"
  occurredAt: Date
  sourceEventId: string
  ctwaClid: string
  wabaId: string
  currency?: string | null
  value?: string | number | null
  // Set to "automatic_events" only for conversions surfaced by Meta's Automatic
  // Events API. Rule-detected conversions omit it — the canonical Conversions
  // API for Business Messaging payload has no messaging_outcome_data, and
  // claiming "automatic_events" for a self-detected event would be inaccurate.
  messagingOutcomeType?: "automatic_events"
}

type EnsureDatasetInput = {
  wabaId: string
  accessToken: string
  version?: string
}

type SendConversionEventInput = {
  datasetId: string
  accessToken: string
  version?: string
  event: ConversionEventInput
}

export class WhatsappConversionsApiException extends WhatsappException {
  readonly retryable: boolean

  constructor(source: ChannelErrorSource, retryable: boolean, origin: unknown) {
    super(
      source.message ?? "WhatsApp Conversions API call failed",
      source.httpStatusCode,
      source.code,
      source.subCode,
      source.type,
      origin,
    )
    this.retryable = retryable
  }
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500
}

async function conversionRescue<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await rescue(fn)
  } catch (error) {
    const origin =
      error instanceof WhatsappException
        ? (error.getOriginError() ?? error)
        : error
    const source = parseOriginError(origin)
    throw new WhatsappConversionsApiException(
      source,
      isRetryableHttpStatus(source.httpStatusCode),
      origin,
    )
  }
}

function readDatasetId(response: unknown): string {
  const parsed = datasetIdResponseSchema.parse(response)
  if ("id" in parsed) {
    return parsed.id
  }
  if ("dataset_id" in parsed) {
    return parsed.dataset_id
  }
  if ("data" in parsed) {
    return parsed.data.id
  }
  return parsed.dataset.id
}

export function ensureDataset({
  wabaId,
  accessToken,
  version = DEFAULT_API_VERSION,
}: EnsureDatasetInput): Promise<string> {
  return conversionRescue(async () => {
    const response = await ky
      .post<unknown>(`${API_URL}/${version}/${wabaId}/dataset`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      .json()

    return readDatasetId(response)
  })
}

function buildConversionEventPayload(event: ConversionEventInput) {
  const hasValue = event.value !== null && event.value !== undefined
  const customData =
    event.currency || hasValue
      ? {
          custom_data: {
            ...(event.currency ? { currency: event.currency } : {}),
            ...(hasValue ? { value: Number(event.value) } : {}),
          },
        }
      : {}

  const messagingOutcomeData = event.messagingOutcomeType
    ? { messaging_outcome_data: { outcome_type: event.messagingOutcomeType } }
    : {}

  return {
    event_name: eventTypeToMetaEventName[event.eventType],
    event_time: Math.floor(event.occurredAt.getTime() / 1000),
    event_id: event.sourceEventId,
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    ...messagingOutcomeData,
    user_data: {
      whatsapp_business_account_id: event.wabaId,
      ctwa_clid: event.ctwaClid,
    },
    ...customData,
  }
}

export function sendConversionEvent({
  datasetId,
  accessToken,
  version = DEFAULT_API_VERSION,
  event,
}: SendConversionEventInput): Promise<void> {
  return conversionRescue(async () => {
    const response = await ky
      .post<unknown>(`${API_URL}/${version}/${datasetId}/events`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        json: {
          data: [buildConversionEventPayload(event)],
          partner_agent: "ChatbotX",
        },
      })
      .json()

    conversionEventsResponseSchema.parse(response)
  })
}
