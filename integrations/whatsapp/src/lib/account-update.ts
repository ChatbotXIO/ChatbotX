import type { IntegrationJobProviderAccountEvent } from "@chatbotx.io/worker-config"
import { z } from "zod"
import { logger } from "./logger"
import { asString, readWebhookEntries } from "./value"

type ProviderAccountEventData = IntegrationJobProviderAccountEvent["data"]

/** What this adapter hands the generic lifecycle job; the route adds `routeScope`. */
export type WhatsappAccountUpdatePayload = Omit<
  ProviderAccountEventData,
  "routeScope"
>

/**
 * Meta `account_update` events that change what we can do with a connected
 * number, mapped onto the channel-agnostic event kinds. Every other event
 * (`PARTNER_ADDED`, restrictions, …) is intentionally ignored.
 */
const ACCOUNT_UPDATE_EVENT_KINDS: Record<
  string,
  ProviderAccountEventData["event"]
> = {
  PARTNER_REMOVED: "revoked",
  ACCOUNT_OFFBOARDED: "offboarded",
  ACCOUNT_RECONNECTED: "reconnected",
}

const UNKNOWN_DETAIL = "unknown"

/** Meta enum values look like `COMPANION_INACTIVITY`; anything else is not trusted into a job or log. */
const boundedEnumValue = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
  .catch(UNKNOWN_DETAIL)

const accountUpdateValueSchema = z.object({
  event: z.string(),
  disconnection_info: z
    .object({
      reason: boundedEnumValue.optional(),
      initiated_by: boundedEnumValue.optional(),
    })
    .optional()
    .catch(undefined),
})

/** Meta stamps events at send time; more than this ahead of our clock is not a real delivery. */
const MAX_EVENT_CLOCK_SKEW_MS = 5 * 60_000

const readEntryTimeMs = (entry: unknown): number | null => {
  const seconds =
    typeof entry === "object" && entry !== null
      ? (entry as { time?: unknown }).time
      : undefined
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000
  }
  return null
}

/**
 * `account_update` changes of a webhook body: one payload per recognised
 * event. `entry.id` is the WABA id. A malformed change is skipped without
 * affecting the rest of the batch.
 */
export const extractAccountUpdatePayloads = (
  rawBody: unknown,
): WhatsappAccountUpdatePayload[] => {
  const payloads: WhatsappAccountUpdatePayload[] = []

  for (const entry of readWebhookEntries(rawBody)) {
    if (typeof entry !== "object" || entry === null) {
      continue
    }
    const wabaId = asString((entry as { id?: unknown }).id)
    const changes = (entry as { changes?: unknown }).changes
    if (!(wabaId && Array.isArray(changes))) {
      continue
    }
    const occurredAt = readEntryTimeMs(entry)
    if (
      occurredAt !== null &&
      occurredAt > Date.now() + MAX_EVENT_CLOCK_SKEW_MS
    ) {
      // A future time would pin the connection's event clock ahead and make
      // every real event after it look stale.
      logger.warn(
        { wabaId },
        "Whatsapp account_update skipped: time is in the future",
      )
      continue
    }
    if (occurredAt === null) {
      // Meta always sends `time`. Without it neither ordering nor the job id
      // would be stable across redeliveries, so the entry is not trusted.
      logger.warn({ wabaId }, "Whatsapp account_update skipped: no entry time")
      continue
    }

    for (const change of changes) {
      if (
        typeof change !== "object" ||
        change === null ||
        (change as { field?: unknown }).field !== "account_update"
      ) {
        continue
      }

      const parsed = accountUpdateValueSchema.safeParse(
        (change as { value?: unknown }).value,
      )
      if (!parsed.success) {
        logger.warn(
          { wabaId },
          "Whatsapp account_update skipped: malformed payload",
        )
        continue
      }

      const event = Object.hasOwn(ACCOUNT_UPDATE_EVENT_KINDS, parsed.data.event)
        ? ACCOUNT_UPDATE_EVENT_KINDS[parsed.data.event]
        : undefined
      if (!event) {
        logger.info(
          { wabaId, metaEvent: parsed.data.event },
          "Whatsapp account_update ignored: event not handled",
        )
        continue
      }

      payloads.push({
        integrationType: "whatsapp",
        account: { kind: "businessAccount", id: wabaId },
        event,
        detail: {
          reason: parsed.data.disconnection_info?.reason ?? UNKNOWN_DETAIL,
          initiatedBy:
            parsed.data.disconnection_info?.initiated_by ?? UNKNOWN_DETAIL,
        },
        occurredAt,
      })
    }
  }

  return payloads
}
