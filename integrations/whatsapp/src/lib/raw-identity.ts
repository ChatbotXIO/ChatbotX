import { z } from "zod"
import { logger } from "./logger"
import { asString } from "./value"

/**
 * Meta's WhatsApp Usernames rollout attaches new fields to the raw webhook
 * payload (`contacts[0].user_id`, `contacts[0].profile.username`,
 * `statuses[0].recipient_user_id`) that whatsapp-api-js@6.2.1's typed
 * `OnMessageArgs`/`OnStatusArgs` (`ServerContacts`, statuses shape) do not
 * model yet — only `raw: PostData` carries them. These shapes are parsed
 * defensively via zod `safeParse` so malformed or unrecognized payloads
 * degrade to "absent" (identical to pre-BSUID behavior) instead of throwing.
 */

const rawContactSchema = z.object({
  wa_id: z.string().optional(),
  user_id: z.string().optional(),
  profile: z
    .object({
      name: z.string().optional(),
      username: z.string().optional(),
    })
    .optional(),
})

const rawMessageChangeSchema = z.object({
  value: z
    .object({
      contacts: z.array(rawContactSchema).optional(),
    })
    .optional(),
})

const rawMessagePostDataSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(rawMessageChangeSchema).optional(),
      }),
    )
    .optional(),
})

export type WhatsappRawUserIdentity = {
  sourceUserId?: string
  sourceUsername?: string
}

/**
 * Extracts the Business-Scoped User ID (BSUID, `contacts[0].user_id`) and
 * username (`contacts[0].profile.username`) from a raw `messages` webhook
 * payload. Returns `{}` when the fields are absent or `raw` itself is
 * absent (no warning — a caller that never threads `raw` through is
 * identical to pre-BSUID behavior), and `{}` with a warn log when `raw` IS
 * present but shaped unexpectedly, so drift from Meta's contract stays
 * observable without false-positiving on ordinary absence.
 */
export const extractWhatsappUserIdentity = (
  raw: unknown,
): WhatsappRawUserIdentity => {
  if (raw == null) {
    return {}
  }

  const parsed = rawMessagePostDataSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      "Whatsapp incoming raw payload did not match expected shape; skipping BSUID/username extraction",
    )
    return {}
  }

  // [0]-indexing mirrors whatsapp-api-js's own dispatch: its post() handler
  // reads exactly entry[0].changes[0].messages[0] and emits on.message ONCE
  // per webhook POST, so contacts[0] is always the sender of the one message
  // this extraction runs for (verified against whatsapp-api-js@6.2.1 source).
  const contact = parsed.data.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]
  const sourceUserId = asString(contact?.user_id)
  const sourceUsername = asString(contact?.profile?.username)

  return {
    ...(sourceUserId ? { sourceUserId } : {}),
    ...(sourceUsername ? { sourceUsername } : {}),
  }
}

const rawStatusChangeSchema = z.object({
  value: z
    .object({
      statuses: z
        .array(
          z.object({
            recipient_id: z.string().optional(),
            recipient_user_id: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
})

const rawStatusPostDataSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(rawStatusChangeSchema).optional(),
      }),
    )
    .optional(),
})

/**
 * Extracts `statuses[0].recipient_user_id` — the BSUID a delivery/read
 * status targets when the message was sent via `recipient` instead of `to`
 * (`recipient_id` is empty in that case). Returns `undefined` when absent or
 * `raw` itself is absent (no warning), and `undefined` with a warn log when
 * `raw` IS present but shaped unexpectedly.
 */
export const extractWhatsappStatusRecipientUserId = (
  raw: unknown,
): string | undefined => {
  if (raw == null) {
    return
  }

  const parsed = rawStatusPostDataSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      "Whatsapp status raw payload did not match expected shape; skipping recipient_user_id extraction",
    )
    return
  }

  const status = parsed.data.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]
  return asString(status?.recipient_user_id) ?? undefined
}
