import {
  contentTypes,
  type IncomingContact,
  type IncomingMessage,
  messageTypes,
  type ThreadControlContext,
  type ThreadControlHistoryItem,
  type ThreadControlReceiveInfo,
  type ThreadControlRole,
  type ThreadControlWebhookEvent,
  threadControlRoles,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import { logger } from "./logger"
import { asString } from "./value"

/**
 * Conversation Routing (thread control) webhook parsing. Every shape is parsed
 * leniently: Meta's docs and the partner PDF disagree in places (history
 * context, `previous_owner_app_id`), unknown fields are ignored, and a payload
 * that does not fit degrades to "absent" instead of throwing, so the webhook
 * can still ACK.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** BullMQ job name for every routing item (handover, standby message, echo). */
export const THREAD_CONTROL_EVENT_JOB_NAME = "threadControlEvent"

export const threadControlPayloadKinds = [
  "handover",
  "standbyMessage",
  "standbyEcho",
] as const
export type ThreadControlPayloadKind =
  (typeof threadControlPayloadKinds)[number]

/** The job payload the webhook extractor enqueues and the handler consumes. */
export type ThreadControlJobPayload = {
  kind: ThreadControlPayloadKind
  body: unknown
}

/**
 * Distinct job-id prefixes: a standby job can never swallow an owner
 * (`wa-msg-`) delivery of the same wamid.
 */
export const THREAD_CONTROL_JOB_ID_PREFIX: Record<
  ThreadControlPayloadKind,
  string
> = {
  handover: "wa-tc",
  standbyMessage: "wa-sb",
  standbyEcho: "wa-sbe",
}

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const toTimestampString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.length > 0) {
    return value
  }
  return typeof value === "number" ? String(value) : undefined
}

/** Meta timestamps are Unix seconds; anything unusable falls back to the clock. */
const metaSecondsToDate = (value: unknown, now = new Date()): Date => {
  const seconds = Number(toTimestampString(value))
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return now
  }
  return new Date(seconds * 1000)
}

/** Role spellings seen in the partner PDF that name an official role. */
const ROLE_ALIASES: Record<string, ThreadControlRole> = {
  meta_ai: "ai_agent",
}

/** Case-insensitive; PDF aliases map to the official roles, unknown -> null. */
const parseRole = (value: unknown): ThreadControlRole | null => {
  if (typeof value !== "string") {
    return null
  }
  const normalised = value.trim().toLowerCase()
  const parsed = threadControlRoles.safeParse(
    ROLE_ALIASES[normalised] ?? normalised,
  )
  return parsed.success ? parsed.data : null
}

/** Text of a WhatsApp send/receive message body, with a `[type]` fallback. */
const readMessageText = (message: unknown): string | undefined => {
  if (!isRecord(message)) {
    return
  }
  const text = message.text
  if (isRecord(text) && typeof text.body === "string") {
    return text.body
  }
  const type = asString(message.type)
  if (!type) {
    return
  }
  const media = message[type]
  const caption = isRecord(media) ? asString(media.caption) : null
  return caption ?? `[${type}]`
}

// ---------------------------------------------------------------------------
// Conversation context
// ---------------------------------------------------------------------------

const rawSummaryContextSchema = z.object({
  type: z.literal("summary"),
  summary: z.object({ text: z.string() }),
})

const rawHistoryItemSchema = z.looseObject({
  sender_type: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  message: z.unknown().optional(),
  message_echo: z.unknown().optional(),
})

const rawHistoryContextSchema = z.object({
  type: z.literal("history"),
  history: z.object({ items: z.array(z.unknown()) }),
})

/** Business items carry the sent message under `message_echo.message`. */
const readHistoryItemText = (
  item: z.infer<typeof rawHistoryItemSchema>,
  sender: ThreadControlHistoryItem["sender"],
): string | undefined => {
  const echoItem = isRecord(item.message_echo) ? item.message_echo : null
  const echo = echoItem?.message ?? null
  if (isRecord(echo) && echo.type === "template") {
    return renderTemplateEcho(echoItem?.template, echo.template)
  }
  const candidates =
    sender === "business" ? [echo, item.message] : [item.message, echo]
  for (const candidate of candidates) {
    const text = readMessageText(candidate)
    if (text !== undefined) {
      return text
    }
  }
  return
}

const parseHistoryItems = (items: unknown[]): ThreadControlHistoryItem[] => {
  const parsedItems: ThreadControlHistoryItem[] = []
  for (const rawItem of items) {
    const item = rawHistoryItemSchema.safeParse(rawItem)
    if (!item.success) {
      continue
    }
    const sender = item.data.sender_type === "business" ? "business" : "user"
    const text = readHistoryItemText(item.data, sender)
    if (text === undefined) {
      continue
    }
    const timestamp = toTimestampString(item.data.timestamp)
    parsedItems.push({ sender, text, ...(timestamp ? { timestamp } : {}) })
  }
  return parsedItems
}

/**
 * `conversation_context` as a display-only context: the official `summary`
 * shape and the PDF's `history` shape. Absent (not null) context, an empty
 * result, or an unknown shape returns `undefined`; an unknown shape also warns.
 */
export const parseConversationContext = (
  value: unknown,
): ThreadControlContext | undefined => {
  if (value === undefined || value === null) {
    return
  }

  const summary = rawSummaryContextSchema.safeParse(value)
  if (summary.success) {
    const text = summary.data.summary.text
    return text.trim().length > 0 ? { type: "summary", text } : undefined
  }

  const history = rawHistoryContextSchema.safeParse(value)
  if (history.success) {
    const items = parseHistoryItems(history.data.history.items)
    return items.length > 0 ? { type: "history", items } : undefined
  }

  logger.warn(
    { contextType: isRecord(value) ? value.type : typeof value },
    "Whatsapp conversation_context ignored: unrecognised shape",
  )
  return
}

/**
 * Routing info of one `messages`/`standby` delivery from its raw single-item
 * body.
 */
export const readThreadControlReceiveInfo = (
  raw: unknown,
): ThreadControlReceiveInfo => {
  const change = readFirstChange(raw)
  const value = change?.value
  const delivery = change?.field === "standby" ? "standby" : "owner"
  const firstMessage =
    isRecord(value) && Array.isArray(value.messages)
      ? value.messages[0]
      : undefined
  const rawContext = isRecord(value)
    ? (value.conversation_context ??
      (isRecord(firstMessage) ? firstMessage.conversation_context : undefined))
    : undefined
  const context = parseConversationContext(rawContext)
  const occurredAt = readDeliveryOccurredAt(value)
  return {
    delivery,
    ...(context ? { context } : {}),
    ...(occurredAt ? { occurredAt } : {}),
  }
}

const firstOf = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] : undefined

/**
 * Meta's own timestamp of the delivered item (`messages[0]` on the owner feed,
 * `standby.messages[0]` / `standby.message_echoes[0]` on standby), so the
 * worker orders it against handover events by Meta time, not queue time.
 * `undefined` when the payload carries no usable timestamp.
 */
const readDeliveryOccurredAt = (value: unknown): Date | undefined => {
  if (!isRecord(value)) {
    return
  }
  const standby = isRecord(value.standby) ? value.standby : undefined
  const item =
    firstOf(standby?.messages) ??
    firstOf(standby?.message_echoes) ??
    firstOf(value.messages)
  if (!isRecord(item)) {
    return
  }
  const seconds = Number(toTimestampString(item.timestamp))
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : undefined
}

const readFirstChange = (
  raw: unknown,
): { field?: unknown; value?: unknown } | undefined => {
  if (!(isRecord(raw) && Array.isArray(raw.entry))) {
    return
  }
  const entry: unknown = raw.entry[0]
  if (!(isRecord(entry) && Array.isArray(entry.changes))) {
    return
  }
  const change: unknown = entry.changes[0]
  return isRecord(change) ? change : undefined
}

// ---------------------------------------------------------------------------
// messaging_handovers
// ---------------------------------------------------------------------------

// `.catch(undefined)` on the string fields: Meta documents these as strings, but
// a single unexpected shape (e.g. an object `metadata`) must not fail the whole
// parse and drop the ownership change — the note/role degrades to absent instead
// (parseRole already tolerates a non-string), matching this file's "degrade, not
// throw" contract.
const handoverPayloadSchema = z.looseObject({
  previous_owner_role: z.string().optional().catch(undefined),
  new_owner_role: z.string().optional().catch(undefined),
  // The partner PDF spells the roles `*_app_role` (e.g. "META_AI").
  previous_owner_app_role: z.string().optional().catch(undefined),
  new_owner_app_role: z.string().optional().catch(undefined),
  metadata: z.string().optional().catch(undefined),
  conversation_context: z.unknown().optional(),
})

const handoverValueSchema = z.looseObject({
  type: z.enum(["control_passed", "control_taken"]),
  timestamp: z.union([z.string(), z.number()]).optional(),
  sender: z
    .looseObject({
      phone_number: z.string().optional(),
      wa_id: z.string().optional(),
      user_id: z.string().optional(),
    })
    .optional(),
  control_passed: handoverPayloadSchema.optional(),
  control_taken: handoverPayloadSchema.optional(),
})

/** The phone number id a `messaging_handovers` value belongs to. */
export const readHandoverPhoneNumberId = (value: unknown): string | null => {
  if (!(isRecord(value) && isRecord(value.recipient))) {
    return null
  }
  return asString(value.recipient.phone_number_id)
}

/**
 * A `messaging_handovers` change value as a handover event. `null` when the
 * shape is unusable or names no contact (nothing to attach the event to).
 */
export const parseHandoverEvent = (
  value: unknown,
  now = new Date(),
): ThreadControlWebhookEvent | null => {
  const parsed = handoverValueSchema.safeParse(value)
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      "Whatsapp messaging_handovers skipped: malformed payload",
    )
    return null
  }

  const { data } = parsed
  const phone = asString(data.sender?.phone_number ?? data.sender?.wa_id)
  const userId = asString(data.sender?.user_id)
  const sourceId = phone ?? userId
  if (!sourceId) {
    logger.warn("Whatsapp messaging_handovers skipped: no sender identity")
    return null
  }

  const isPassed = data.type === "control_passed"
  const payload = isPassed ? data.control_passed : data.control_taken
  const context = isPassed
    ? parseConversationContext(payload?.conversation_context)
    : undefined
  const handoverNote = asString(payload?.metadata)
  const contact: IncomingContact = {
    sourceId,
    ...(userId ? { sourceUserId: userId } : {}),
  }

  return {
    contact,
    event: isPassed ? "controlPassed" : "controlTaken",
    previousOwnerRole: parseRole(
      payload?.previous_owner_role ?? payload?.previous_owner_app_role,
    ),
    newOwnerRole: parseRole(
      payload?.new_owner_role ?? payload?.new_owner_app_role,
    ),
    ...(handoverNote ? { handoverNote } : {}),
    ...(context ? { context } : {}),
    occurredAt: metaSecondsToDate(data.timestamp, now),
  }
}

// ---------------------------------------------------------------------------
// Template echo rendering
// ---------------------------------------------------------------------------

type TemplateParameter = {
  type?: string
  text?: string
  parameter_name?: string
}
type SentTemplateComponent = { type?: string; parameters?: TemplateParameter[] }
type TemplateDefinitionComponent = {
  type?: string
  format?: string
  text?: string
}

const PLACEHOLDER_RE = /\{\{\s*([\w]+)\s*\}\}/g
const NUMERIC_RE = /^\d+$/

const readSentComponents = (sent: unknown): SentTemplateComponent[] => {
  if (!(isRecord(sent) && Array.isArray(sent.components))) {
    return []
  }
  return sent.components.filter(isRecord) as SentTemplateComponent[]
}

const findSentComponent = (
  components: SentTemplateComponent[],
  type: "header" | "body",
): SentTemplateComponent | undefined =>
  components.find((component) => component.type?.toLowerCase() === type)

/** `{{n}}` takes the n-th sent parameter, `{{name}}` the parameter of that name. */
const fillPlaceholders = (
  text: string,
  parameters: TemplateParameter[],
): string =>
  text.replace(PLACEHOLDER_RE, (placeholder, key: string) => {
    const parameter = NUMERIC_RE.test(key)
      ? parameters[Number(key) - 1]
      : parameters.find((candidate) => candidate.parameter_name === key)
    return typeof parameter?.text === "string" ? parameter.text : placeholder
  })

/**
 * Renders a template echo as readable text: the definition's HEADER/BODY text
 * with `{{n}}` replaced by the sent parameters, a `[image]`-style prefix for a
 * media header, and the template name when the definition (or its body) is
 * missing.
 */
export const renderTemplateEcho = (
  definition: unknown,
  sentTemplate: unknown,
): string => {
  const name =
    isRecord(sentTemplate) && asString(sentTemplate.name)
      ? (asString(sentTemplate.name) as string)
      : "template"
  const definitionComponents =
    isRecord(definition) && Array.isArray(definition.components)
      ? (definition.components.filter(
          isRecord,
        ) as TemplateDefinitionComponent[])
      : []
  const sentComponents = readSentComponents(sentTemplate)

  const header = definitionComponents.find(
    (component) => component.type?.toUpperCase() === "HEADER",
  )
  const body = definitionComponents.find(
    (component) => component.type?.toUpperCase() === "BODY",
  )
  if (!body?.text) {
    return `[template] ${name}`
  }

  const lines: string[] = []
  const headerFormat = header?.format?.toUpperCase()
  if (header && headerFormat === "TEXT" && header.text) {
    lines.push(
      fillPlaceholders(
        header.text,
        findSentComponent(sentComponents, "header")?.parameters ?? [],
      ),
    )
  } else if (header && headerFormat) {
    lines.push(`[${headerFormat.toLowerCase()}]`)
  }
  lines.push(
    fillPlaceholders(
      body.text,
      findSentComponent(sentComponents, "body")?.parameters ?? [],
    ),
  )
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Standby echoes
// ---------------------------------------------------------------------------

const readEchoText = (echo: Record<string, unknown>): string => {
  const sent = isRecord(echo.message) ? echo.message : {}
  if (sent.type === "template") {
    return renderTemplateEcho(echo.template, sent.template)
  }
  if (sent.type === "interactive" && isRecord(sent.interactive)) {
    const { body, header } = sent.interactive
    const bodyText = isRecord(body) ? asString(body.text) : null
    const headerText = isRecord(header) ? asString(header.text) : null
    return bodyText ?? headerText ?? "[interactive]"
  }
  return readMessageText(sent) ?? "[message]"
}

/** True for a standby `message_echoes[]` item built into a job body. */
export const isStandbyEchoItem = (
  item: unknown,
): item is Record<string, unknown> =>
  isRecord(item) && typeof item.id === "string" && isRecord(item.message)

/**
 * A partner's outgoing message (standby echo) as an outgoing, third-party
 * message on the contact it was sent to. The echo carries the exact Send API
 * body, so media is labelled, never downloaded.
 */
export const parseStandbyEcho = (
  echo: Record<string, unknown>,
): { message: IncomingMessage; contact: IncomingContact } => {
  const sent = isRecord(echo.message) ? echo.message : {}
  const to = asString(sent.to)
  const recipient = asString(sent.recipient)
  const sourceId = to ?? recipient ?? ""

  return {
    message: {
      sourceId: echo.id as string,
      messageType: messageTypes.enum.outgoing,
      contentType: contentTypes.enum.text,
      text: readEchoText(echo),
      contentAttributes: { threadControlEcho: true },
    },
    contact: {
      sourceId,
      ...(recipient && !to ? { sourceUserId: recipient } : {}),
    },
  }
}
