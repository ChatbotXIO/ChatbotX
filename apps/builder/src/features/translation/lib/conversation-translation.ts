import { z } from "zod"

const attributesSchema = z.object({
  translation: z
    .object({
      enabledOverride: z.boolean().optional(),
      language: z.string().optional(),
      languageSource: z.enum(["auto", "manual"]).optional(),
    })
    .optional(),
})

export type ConversationTranslationAttributes = {
  /** `false`: turned off for this conversation only; `true`: turned on by an agent. */
  enabledOverride: boolean | null
  language: string | null
  languageSource: "auto" | "manual" | null
}

/** Reads `additionalAttributes.translation` of a conversation; tolerates any other shape. */
export function readConversationTranslation(conversation: {
  additionalAttributes?: unknown
}): ConversationTranslationAttributes {
  const parsed = attributesSchema.safeParse(
    conversation.additionalAttributes ?? {},
  )
  const translation = parsed.success ? parsed.data.translation : undefined
  return {
    enabledOverride: translation?.enabledOverride ?? null,
    language: translation?.language ?? null,
    languageSource: translation?.languageSource ?? null,
  }
}

const recordSchema = z.record(z.string(), z.unknown())

/**
 * `additionalAttributes` with its `translation` object replaced, every other key
 * kept (a `challenge` set by a flow must survive).
 */
export function withConversationTranslation(
  additionalAttributes: unknown,
  translation: {
    enabledOverride?: boolean
    language?: string
    languageSource?: "auto" | "manual"
  },
): Record<string, unknown> {
  return {
    ...(recordSchema.safeParse(additionalAttributes).data ?? {}),
    translation,
  }
}

/**
 * `additionalAttributes` once the bot takes the conversation back: an agent's
 * "on" is dropped (the server does the same), an "off" and the language stay.
 */
export function withoutTranslationTurnedOn<T>(
  additionalAttributes: T,
): T | Record<string, unknown> {
  const current = readConversationTranslation({ additionalAttributes })
  if (current.enabledOverride !== true) {
    return additionalAttributes
  }
  return withConversationTranslation(additionalAttributes, {
    ...(current.language ? { language: current.language } : {}),
    ...(current.languageSource
      ? { languageSource: current.languageSource }
      : {}),
  })
}

/**
 * Whether the Inbox translates a conversation, before the workspace switch:
 * an agent's choice (`false` off, `true` on) always wins. Without one, a
 * conversation the bot is on duty for is not translated: the bot is active
 * ("Bot is active"), or an agent took it over for a while (the bot resumes
 * later). Agents often only answer in the bot's place and hand it back, so
 * taking the bot over does not turn translation on; the agent does. A bot
 * that is off for good leaves translation on. Only the Inbox applies this:
 * the API and the AI agent keep translating whenever they ask.
 */
export function isConversationTranslationOn(input: {
  enabledOverride: boolean | null
  /** Bot active, or paused until it resumes (`botResumeAt` set). */
  botOnDuty: boolean
}): boolean {
  if (input.enabledOverride !== null) {
    return input.enabledOverride
  }
  return !input.botOnDuty
}
