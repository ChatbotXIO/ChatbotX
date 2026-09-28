import { resolvePhoneTransition } from "@chatbotx.io/business/contact-inbox/identity-rotation"
import { isDistinctPrimaryIdentity } from "@chatbotx.io/sdk"
import type {
  WhatsappIdentityChange,
  WhatsappIdentityChangePayload,
} from "@chatbotx.io/worker-config"
import { z } from "zod"
import { logger } from "./logger"
import { readWebhookEntries } from "./value"

const nonEmptyString = z.string().trim().min(1)
const userIdChangeBodyPattern =
  /^User (.+) changed from (\S+) to (\S+?)(?:\.)?$/

const systemMessageEnvelopeSchema = z.object({
  id: nonEmptyString,
  from: z.string().optional(),
  from_parent_user_id: z.string().optional(),
  from_user_id: z.string().optional(),
  timestamp: z.string().optional(),
  type: z.literal("system"),
  system: z.object({ type: nonEmptyString }).passthrough(),
})

const userIdChangedSystemSchema = z.object({
  type: z.literal("user_changed_user_id"),
  body: z.string().optional(),
  previous_user_id: z.string().optional(),
  user_id: nonEmptyString,
  previous_parent_user_id: z.string().optional(),
  parent_user_id: z.string().optional(),
  wa_id: z.string().optional(),
})

const phoneChangedSystemSchema = z.object({
  type: z.enum(["user_changed_number", "customer_changed_number"]),
  wa_id: nonEmptyString,
  user_id: nonEmptyString.optional(),
})

const messagesChangeValueSchema = z.object({
  metadata: z.object({ phone_number_id: nonEmptyString }),
  messages: z.array(z.unknown()),
})

type ParsedSystemMessage = z.infer<typeof systemMessageEnvelopeSchema>
type IdentityChangeStrategy = (
  message: ParsedSystemMessage,
  phoneNumberId: string,
) => WhatsappIdentityChange | undefined

const warnSkippedIdentity = (
  message: ParsedSystemMessage,
  phoneNumberId: string,
  context: Record<string, unknown>,
): undefined => {
  logger.warn(
    { messageId: message.id, phoneNumberId, ...context },
    "Whatsapp identity change skipped: invalid or incomplete identity transition",
  )
}

const trimOptional = (value: string | undefined): string | undefined =>
  value?.trim() || undefined

const parsePreviousUserIdFromBody = (
  body: string | undefined,
  userId: string,
): string | undefined => {
  const match = body?.trim().match(userIdChangeBodyPattern)
  if (!match || match[3] !== userId) {
    return
  }
  return match[2]
}

const normalizeUserIdChanged: IdentityChangeStrategy = (
  message,
  phoneNumberId,
) => {
  const parsed = userIdChangedSystemSchema.safeParse(message.system)
  if (!parsed.success) {
    logger.warn(
      {
        issues: parsed.error.issues,
        messageId: message.id,
        phoneNumberId,
      },
      "Whatsapp identity change skipped: malformed system payload",
    )
    return
  }

  const userId = parsed.data.user_id
  const previousUserId = [
    trimOptional(parsed.data.previous_user_id),
    parsePreviousUserIdFromBody(parsed.data.body, userId),
    trimOptional(message.from_user_id),
  ].find((candidate) => candidate !== undefined && candidate !== userId)
  const previousParentUserId =
    trimOptional(parsed.data.previous_parent_user_id) ??
    trimOptional(message.from_parent_user_id)
  const parentUserId = trimOptional(parsed.data.parent_user_id)
  const previousPhone = trimOptional(message.from)
  const reportedPhone = trimOptional(parsed.data.wa_id)
  const newPhone = isDistinctPrimaryIdentity(
    reportedPhone,
    userId,
    message.from_user_id,
  )
    ? resolvePhoneTransition({
        previousPhone,
        newPhone: reportedPhone,
        scopedUserIds: [userId, message.from_user_id],
      })?.newPhone
    : undefined

  if (!(previousUserId || previousParentUserId || previousPhone)) {
    return warnSkippedIdentity(message, phoneNumberId, {
      userId,
      previousUserId,
      previousParentUserId,
      previousPhone,
    })
  }
  return {
    kind: "userIdChanged",
    previousUserId,
    userId,
    previousParentUserId,
    parentUserId,
    previousPhone,
    newPhone,
  }
}

const normalizePhoneChanged: IdentityChangeStrategy = (
  message,
  phoneNumberId,
) => {
  const parsed = phoneChangedSystemSchema.safeParse(message.system)
  const previousPhone = message.from?.trim()
  if (!(parsed.success && previousPhone)) {
    logger.warn(
      {
        issues: parsed.success
          ? [{ message: "messages[].from must be non-empty" }]
          : parsed.error.issues,
        messageId: message.id,
        phoneNumberId,
      },
      "Whatsapp identity change skipped: malformed system payload",
    )
    return
  }
  const userId =
    trimOptional(message.from_user_id) ?? trimOptional(parsed.data.user_id)
  const reportedPhone = trimOptional(parsed.data.wa_id)
  const newPhone = isDistinctPrimaryIdentity(
    reportedPhone,
    message.from_user_id,
    parsed.data.user_id,
  )
    ? resolvePhoneTransition({
        previousPhone,
        newPhone: reportedPhone,
        scopedUserIds: [message.from_user_id, parsed.data.user_id],
      })?.newPhone
    : undefined
  if (!newPhone) {
    return warnSkippedIdentity(message, phoneNumberId, {
      previousPhone,
      newPhone: parsed.data.wa_id,
      userId,
    })
  }
  return {
    kind: "phoneChanged",
    previousPhone,
    newPhone,
    userId,
  }
}

const identityChangeStrategies = {
  user_changed_user_id: normalizeUserIdChanged,
  user_changed_number: normalizePhoneChanged,
  customer_changed_number: normalizePhoneChanged,
} satisfies Record<string, IdentityChangeStrategy>

type SupportedSystemType = keyof typeof identityChangeStrategies

const isSupportedSystemType = (value: string): value is SupportedSystemType =>
  value in identityChangeStrategies

export const isSystemMessage = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (value as { type?: unknown }).type === "system"

type MessagesChangeValue = z.infer<typeof messagesChangeValueSchema>

const readMessagesChangeValues = (rawBody: unknown): MessagesChangeValue[] => {
  const values: MessagesChangeValue[] = []

  for (const entry of readWebhookEntries(rawBody)) {
    if (typeof entry !== "object" || entry === null) {
      continue
    }
    const changes = (entry as { changes?: unknown }).changes
    if (!Array.isArray(changes)) {
      continue
    }
    for (const change of changes) {
      if (
        typeof change !== "object" ||
        change === null ||
        (change as { field?: unknown }).field !== "messages"
      ) {
        continue
      }
      const rawValue = (change as { value?: unknown }).value
      const rawMessages =
        typeof rawValue === "object" && rawValue !== null
          ? (rawValue as { messages?: unknown }).messages
          : undefined
      if (!(Array.isArray(rawMessages) && rawMessages.some(isSystemMessage))) {
        continue
      }
      const value = messagesChangeValueSchema.safeParse(rawValue)
      if (!value.success) {
        logger.warn(
          { issues: value.error.issues },
          "Whatsapp identity change skipped: malformed messages change",
        )
        continue
      }
      values.push(value.data)
    }
  }

  return values
}

const normalizeSystemMessage = (
  rawMessage: unknown,
  phoneNumberId: string,
): WhatsappIdentityChangePayload | undefined => {
  if (!isSystemMessage(rawMessage)) {
    return
  }
  const message = systemMessageEnvelopeSchema.safeParse(rawMessage)
  if (!message.success) {
    logger.warn(
      { issues: message.error.issues },
      "Whatsapp identity change skipped: malformed system message",
    )
    return
  }
  const systemType = message.data.system.type
  if (!isSupportedSystemType(systemType)) {
    logger.info(
      {
        messageId: message.data.id,
        phoneNumberId,
        systemType,
      },
      "Whatsapp system message skipped: unsupported type",
    )
    return
  }
  const change = identityChangeStrategies[systemType](
    message.data,
    phoneNumberId,
  )
  if (!change) {
    return
  }
  return {
    phoneNumberId,
    messageId: message.data.id,
    timestamp: message.data.timestamp,
    change,
  }
}

export const extractIdentityChangePayloads = (
  rawBody: unknown,
): WhatsappIdentityChangePayload[] => {
  const payloads: WhatsappIdentityChangePayload[] = []

  for (const value of readMessagesChangeValues(rawBody)) {
    for (const message of value.messages) {
      const payload = normalizeSystemMessage(
        message,
        value.metadata.phone_number_id,
      )
      if (payload) {
        payloads.push(payload)
      }
    }
  }

  return payloads
}
