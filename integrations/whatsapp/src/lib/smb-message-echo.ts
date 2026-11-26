import type { IncomingContact } from "@chatbotx.io/sdk"
import { z } from "zod"
import { asString } from "./value"

/**
 * Messages the business sent from the WhatsApp Business app or a linked device
 * (Coexistence) arrive on this webhook field, one `message_echoes[]` item each.
 * Edits and revokes made in the app arrive on it too, with `type` set to
 * `edit` or `revoke`.
 */
export const SMB_MESSAGE_ECHOES_FIELD = "smb_message_echoes"

/** Marks a job payload as one echo, so the parser can tell it from a customer message. */
export const SMB_MESSAGE_ECHO_PAYLOAD_KIND = "smbMessageEcho"

/**
 * What an echo is: a message the business sent, or a change to one it already
 * sent (an edit or a revoke made in the app).
 */
export const smbEchoKinds = {
  message: "message",
  edit: "edit",
  revoke: "revoke",
} as const
export type SmbEchoKind = (typeof smbEchoKinds)[keyof typeof smbEchoKinds]

/** Echo `type` values that are changes to a sent message; any other is a message. */
const SMB_ECHO_KIND_BY_TYPE: ReadonlyMap<string, SmbEchoKind> = new Map([
  ["edit", smbEchoKinds.edit],
  ["revoke", smbEchoKinds.revoke],
])

export const readSmbEchoKind = (type: unknown): SmbEchoKind =>
  (typeof type === "string" ? SMB_ECHO_KIND_BY_TYPE.get(type) : undefined) ??
  smbEchoKinds.message

/** Echo types whose content is a media object the live media parsers read. */
const SMB_ECHO_MEDIA_TYPES = [
  "image",
  "video",
  "document",
  "audio",
  "sticker",
] as const
type SmbEchoMediaType = (typeof SMB_ECHO_MEDIA_TYPES)[number]

/**
 * The part of an echo every consumer reads: its id, time, type and the
 * recipient's identity. Content keys ride on the loose object and are
 * validated per type by `readSmbEchoMedia` / `readSmbEchoText`, so an unknown or malformed
 * type never fails the whole echo.
 *
 * `to` is omitted for a recipient who adopted a username; `to_user_id` (the
 * business-scoped user id) is always present.
 */
export const smbMessageEchoEnvelopeSchema = z.looseObject({
  id: z.string().min(1),
  type: z.string().min(1).optional(),
  to: z.string().optional(),
  to_user_id: z.string().optional(),
  to_parent_user_id: z.string().optional(),
})
export type SmbMessageEchoEnvelope = z.infer<
  typeof smbMessageEchoEnvelopeSchema
>

/** One `contacts[]` entry of the change an echo came in. */
export const smbMessageEchoContactSchema = z.looseObject({
  wa_id: z.string().optional(),
  user_id: z.string().optional(),
  parent_user_id: z.string().optional(),
  profile: z
    .looseObject({
      name: z.string().optional(),
      username: z.string().optional(),
    })
    .optional(),
})
export type SmbMessageEchoContact = z.infer<typeof smbMessageEchoContactSchema>

/** What the webhook hands the worker for one live echo. */
const smbMessageEchoPayloadSchema = z.object({
  kind: z.literal(SMB_MESSAGE_ECHO_PAYLOAD_KIND),
  phoneID: z.string().min(1),
  echo: smbMessageEchoEnvelopeSchema,
  contact: smbMessageEchoContactSchema.optional(),
})
export type SmbMessageEchoPayload = z.infer<typeof smbMessageEchoPayloadSchema>

/** Narrows a job payload to a live echo; anything else is a customer message. */
export const readSmbMessageEchoPayload = (
  payload: unknown,
): SmbMessageEchoPayload | null => {
  const parsed = smbMessageEchoPayloadSchema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

const textContentSchema = z.looseObject({
  text: z.looseObject({ body: z.string() }),
})

/** The live media parsers need the media id and its MIME type. */
const mediaContentSchema = z.looseObject({
  id: z.string().min(1),
  mime_type: z.string().min(1),
  caption: z.string().optional(),
  filename: z.string().optional(),
})
type SmbEchoMedia = z.infer<typeof mediaContentSchema>

const isSmbEchoMediaType = (type: string): type is SmbEchoMediaType =>
  (SMB_ECHO_MEDIA_TYPES as readonly string[]).includes(type)

/** A media echo the live media parsers can store: its type and media object. */
type SmbEchoMediaContent = {
  mediaType: SmbEchoMediaType
  media: SmbEchoMedia
}

/**
 * The media of an echo, when it is one the live media parsers can store (they
 * need the media id and MIME type); `null` for any other echo.
 */
export const readSmbEchoMedia = (
  echo: SmbMessageEchoEnvelope,
): SmbEchoMediaContent | null => {
  const type = echo.type
  if (!(type && isSmbEchoMediaType(type))) {
    return null
  }
  const media = mediaContentSchema.safeParse(echo[type])
  return media.success ? { mediaType: type, media: media.data } : null
}

/**
 * The text an echo is stored with when it is not stored as media: the body of a
 * text echo; for anything else (an interactive, button, order, contacts or
 * location echo, which only the customer-message parsers read, or content
 * missing a required field) the `[type]` placeholder the history import also
 * stores.
 */
export const readSmbEchoText = (echo: SmbMessageEchoEnvelope): string => {
  const text = textContentSchema.safeParse(echo)
  if (echo.type === "text" && text.success) {
    return text.data.text.body
  }
  return `[${echo.type ?? "unknown"}]`
}

/**
 * The customer the echo was sent to. The business-scoped user id is the stable
 * identity (Meta: `to` is omitted for a username user), so it is the fallback
 * key when there is no phone number.
 */
export const buildSmbEchoContact = (
  echo: SmbMessageEchoEnvelope,
  contact: SmbMessageEchoContact | undefined,
): IncomingContact => {
  const sourceUserId = asString(echo.to_user_id) ?? asString(contact?.user_id)
  const sourceParentUserId =
    asString(echo.to_parent_user_id) ?? asString(contact?.parent_user_id)
  const sourceUsername = asString(contact?.profile?.username)
  const firstName = asString(contact?.profile?.name)
  return {
    sourceId: asString(echo.to) ?? sourceUserId ?? "",
    ...(firstName ? { firstName } : {}),
    ...(sourceUserId ? { sourceUserId } : {}),
    ...(sourceParentUserId ? { sourceParentUserId } : {}),
    ...(sourceUsername ? { sourceUsername } : {}),
  }
}

const captionSchema = z.looseObject({ caption: z.string().optional() })

const editContentSchema = z.looseObject({
  edit: z.looseObject({
    original_message_id: z.string().min(1),
    message: z
      .looseObject({
        text: z.looseObject({ body: z.string() }).optional(),
        image: captionSchema.optional(),
        video: captionSchema.optional(),
        document: captionSchema.optional(),
      })
      .optional(),
  }),
})

const revokeContentSchema = z.looseObject({
  revoke: z.looseObject({ original_message_id: z.string().min(1) }),
})

/** The id of the message a revoke removes, or `null` when the echo names none. */
export const readSmbEchoRevokedMessageId = (
  echo: SmbMessageEchoEnvelope,
): string | null => {
  const revoke = revokeContentSchema.safeParse(echo)
  return revoke.success ? revoke.data.revoke.original_message_id : null
}

/**
 * The message an edit changes and its new text (the body, or the caption of a
 * media message, possibly empty when it was cleared), or `null` when the echo
 * names no message or carries no text at all (a media edit that only touches
 * the media is not shown).
 */
export const readSmbEchoEdit = (
  echo: SmbMessageEchoEnvelope,
): { originalMessageId: string; newText: string } | null => {
  const parsed = editContentSchema.safeParse(echo)
  if (!parsed.success) {
    return null
  }
  const { original_message_id: originalMessageId, message } = parsed.data.edit
  const newText =
    message?.text?.body ??
    message?.image?.caption ??
    message?.video?.caption ??
    message?.document?.caption
  // An empty caption is a real edit (the caption was cleared); only an edit
  // with no text at all is skipped.
  return newText === undefined ? null : { originalMessageId, newText }
}
