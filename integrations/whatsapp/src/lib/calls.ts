import { z } from "zod"
import { logger } from "./logger"

/**
 * Parsing for Meta's `calls` webhook field (WhatsApp Business Calling API).
 *
 * The field carries two shapes on `value`:
 *  - `calls[]`    — Call Connect (`event: "connect"`) and Call Terminate
 *                   (`event: "terminate"`) events
 *  - `statuses[]` — interim call status updates (RINGING/ACCEPTED/REJECTED)
 *
 * Reference:
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/reference
 */

const callDirectionSchema = z.enum(["USER_INITIATED", "BUSINESS_INITIATED"])

const callContactSchema = z.object({
  wa_id: z.string(),
  user_id: z.string().optional(),
  profile: z.object({ name: z.string().optional() }).optional(),
})

const callEventItemSchema = z.object({
  id: z.string(),
  event: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  direction: callDirectionSchema.optional(),
  status: z.string().optional(),
  start_time: z.union([z.string(), z.number()]).optional(),
  end_time: z.union([z.string(), z.number()]).optional(),
  duration: z.union([z.string(), z.number()]).optional(),
  biz_opaque_callback_data: z.string().optional(),
})

const callStatusItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  type: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  recipient_id: z.string().optional(),
  biz_opaque_callback_data: z.string().optional(),
})

const callsValueSchema = z.object({
  metadata: z.object({
    phone_number_id: z.string(),
    display_phone_number: z.string().optional(),
  }),
  contacts: z.array(callContactSchema).optional(),
  calls: z.array(callEventItemSchema).optional(),
  statuses: z.array(callStatusItemSchema).optional(),
})

export type WhatsappCallDirectionPayload = "userInitiated" | "businessInitiated"

export type WhatsappCallContactPayload = {
  waId: string
  userId?: string
  name?: string
}

/** Normalized single call event, ready to enqueue as one integration job. */
export type WhatsappCallEventPayload = {
  phoneNumberId: string
  contact?: WhatsappCallContactPayload
  event:
    | {
        kind: "connect"
        wacid: string
        direction: WhatsappCallDirectionPayload
        from?: string
        to?: string
        timestamp?: string
      }
    | {
        kind: "terminate"
        wacid: string
        direction?: WhatsappCallDirectionPayload
        status: "COMPLETED" | "FAILED"
        from?: string
        to?: string
        timestamp?: string
        startTime?: string
        endTime?: string
        durationSeconds?: number
      }
    | {
        kind: "status"
        wacid: string
        status: "RINGING" | "ACCEPTED" | "REJECTED"
        recipientId?: string
        timestamp?: string
      }
}

const toDirection = (
  raw: z.infer<typeof callDirectionSchema> | undefined,
): WhatsappCallDirectionPayload | undefined => {
  if (raw === "USER_INITIATED") {
    return "userInitiated"
  }
  if (raw === "BUSINESS_INITIATED") {
    return "businessInitiated"
  }
  return
}

const toOptionalString = (
  value: string | number | undefined,
): string | undefined => (value === undefined ? undefined : String(value))

const toContactPayload = (
  contacts: z.infer<typeof callContactSchema>[] | undefined,
): WhatsappCallContactPayload | undefined => {
  const contact = contacts?.[0]
  if (!contact) {
    return
  }
  return {
    waId: contact.wa_id,
    userId: contact.user_id,
    name: contact.profile?.name,
  }
}

const readWebhookEntries = (rawBody: unknown): unknown[] => {
  if (typeof rawBody !== "object" || rawBody === null) {
    return []
  }
  const entries = (rawBody as { entry?: unknown }).entry
  return Array.isArray(entries) ? entries : []
}

const normalizeCallItem = (
  item: z.infer<typeof callEventItemSchema>,
): WhatsappCallEventPayload["event"] | undefined => {
  if (item.event === "connect" || item.event === "call_created") {
    const direction = toDirection(item.direction)
    if (!direction) {
      logger.warn(
        { wacid: item.id, direction: item.direction },
        "Whatsapp call connect skipped: missing direction",
      )
      return
    }
    return {
      kind: "connect",
      wacid: item.id,
      direction,
      from: item.from,
      to: item.to,
      timestamp: toOptionalString(item.timestamp),
    }
  }

  if (item.event === "terminate") {
    const status = item.status === "COMPLETED" ? "COMPLETED" : "FAILED"
    const duration = Number(item.duration)
    return {
      kind: "terminate",
      wacid: item.id,
      direction: toDirection(item.direction),
      status,
      from: item.from,
      to: item.to,
      timestamp: toOptionalString(item.timestamp),
      startTime: toOptionalString(item.start_time),
      endTime: toOptionalString(item.end_time),
      durationSeconds: Number.isFinite(duration) ? duration : undefined,
    }
  }

  logger.warn(
    { wacid: item.id, event: item.event },
    "Whatsapp call event skipped: unknown event",
  )
  return
}

const normalizeStatusItem = (
  item: z.infer<typeof callStatusItemSchema>,
): WhatsappCallEventPayload["event"] | undefined => {
  if (
    item.status !== "RINGING" &&
    item.status !== "ACCEPTED" &&
    item.status !== "REJECTED"
  ) {
    logger.warn(
      { wacid: item.id, status: item.status },
      "Whatsapp call status skipped: unknown status",
    )
    return
  }
  return {
    kind: "status",
    wacid: item.id,
    status: item.status,
    recipientId: item.recipient_id,
    timestamp: toOptionalString(item.timestamp),
  }
}

/**
 * Extracts every call event from a raw webhook body. Malformed entries are
 * logged and skipped so one bad item never blocks the rest of the batch
 * (mirrors the automatic-events extractor).
 */
export const extractCallEventPayloads = (
  rawBody: unknown,
): WhatsappCallEventPayload[] => {
  const payloads: WhatsappCallEventPayload[] = []

  for (const entry of readWebhookEntries(rawBody)) {
    const changes =
      typeof entry === "object" && entry !== null
        ? (entry as { changes?: unknown }).changes
        : undefined
    if (!Array.isArray(changes)) {
      continue
    }

    for (const change of changes) {
      if (
        typeof change !== "object" ||
        change === null ||
        (change as { field?: unknown }).field !== "calls"
      ) {
        continue
      }

      const parsed = callsValueSchema.safeParse(
        (change as { value?: unknown }).value,
      )
      if (!parsed.success) {
        logger.warn(
          { issues: parsed.error.issues },
          "Whatsapp call webhook skipped: malformed value",
        )
        continue
      }

      const { metadata, contacts, calls, statuses } = parsed.data
      const contact = toContactPayload(contacts)

      // Interim statuses are pushed (and therefore enqueued) BEFORE call
      // events: when a batch carries both a REJECTED status and its
      // terminate, the terminate handler must be able to see the rejection
      // to label the call "declined" rather than "missed".
      for (const item of statuses ?? []) {
        const event = normalizeStatusItem(item)
        if (event) {
          payloads.push({
            phoneNumberId: metadata.phone_number_id,
            contact,
            event,
          })
        }
      }

      for (const item of calls ?? []) {
        const event = normalizeCallItem(item)
        if (event) {
          payloads.push({
            phoneNumberId: metadata.phone_number_id,
            contact,
            event,
          })
        }
      }
    }
  }

  return payloads
}
