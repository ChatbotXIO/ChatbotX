import { translationSkipReasons } from "@chatbotx.io/business/translation/skip-reasons"
import { aiAgentModelConfig } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const translationLanguage = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .describe(
    "Language code: ISO 639-1 such as `es`, or `zh-Hans` / `zh-Hant` for Chinese.",
  )

const translationSettingsStatus = z
  .enum(["active", "needsReconfiguration", "disabled"])
  .describe(
    "`active`: on and the AI integration works. `needsReconfiguration`: on, but no AI model is chosen or the integration was removed or disabled. `disabled`: off.",
  )

export const translationSettingsResource = z.object({
  enabled: z.boolean().describe("The workspace switch."),
  status: translationSettingsStatus,
  workspaceLanguage: z
    .string()
    .describe(
      "`Workspace.language`: customers' messages are translated into it and agents write in it.",
    ),
  modelConfig: aiAgentModelConfig
    .nullable()
    .describe(
      "The chosen AI provider and model, in the same shape an AI Agent stores. `null` when none was chosen.",
    ),
  integration: z
    .object({
      available: z.boolean(),
      label: z.string().nullable(),
    })
    .nullable()
    .describe(
      "Non-secret state of the chosen integration; `null` when no model is chosen.",
    ),
  enabledAt: z.coerce
    .date()
    .nullable()
    .describe(
      "When translation was first switched on. Informational: messages received before it are translated too, when someone opens the conversation or scrolls back to them.",
    ),
})
export type TranslationSettingsResource = z.infer<
  typeof translationSettingsResource
>

export const translationTestResource = z.object({
  latencyMs: z.number().int().nonnegative(),
  slow: z
    .boolean()
    .describe(
      "True when the model took longer than 5 s: outgoing messages may not be translated within their 10 s budget and would then not be sent.",
    ),
  sampleText: z.string(),
  translatedText: z.string(),
  targetLanguage: z.string(),
})

/** A message's translation as the inbox and `messages.list` show it. */
export const messageTranslationResource = z
  .object({
    direction: z.enum(["inbound", "outbound"]),
    status: z.enum(["translated", "failed", "skipped"]),
    displayText: z
      .string()
      .nullable()
      .describe(
        "Inbound: the text translated into the workspace language. Outbound: the sentence the agent typed (`message.text` is what the customer received). `null` unless `translated`.",
      ),
    sourceLanguage: z.string().nullable(),
    targetLanguage: z.string(),
    failureCode: z.string().nullable(),
  })
  .nullable()
export type MessageTranslationResource = z.infer<
  typeof messageTranslationResource
>

export const conversationTranslationStateResource = z.object({
  enabledOverride: z
    .boolean()
    .nullable()
    .describe(
      "`false` when translation was turned off for this conversation only; `true` when an agent turned it on for the Inbox (cleared when the bot takes the conversation back). `null`: the default. It can never turn translation on for a workspace that has it off.",
    ),
  effectiveEnabled: z.boolean(),
  language: z
    .string()
    .nullable()
    .describe(
      "The customer's language: what their messages are translated from and agent messages are translated into. `null` until known.",
    ),
  languageSource: z
    .enum(["auto", "manual"])
    .nullable()
    .describe(
      "`auto`: detected from a customer message. `manual`: set by an agent through `translation.updateConversationState`; never changed by detection.",
    ),
})
export type ConversationTranslationStateResource = z.infer<
  typeof conversationTranslationStateResource
>

export const translationMessageRef = z.object({
  id: zodBigintAsString().describe("Message id from `messages.list`."),
  createdAt: z.coerce
    .date()
    .describe(
      "The message's `createdAt`, exactly as `messages.list` returned it.",
    ),
})

export const requestTranslationsResource = z.object({
  accepted: z
    .array(zodBigintAsString())
    .describe(
      "Messages queued for translation. Read the result with `messages.list`, field `translation`.",
    ),
  skipped: z.array(
    z.object({ id: zodBigintAsString(), reason: translationSkipReasons }),
  ),
})
export type RequestTranslationsResource = z.infer<
  typeof requestTranslationsResource
>

export const translationPreviewResource = z.object({
  translatedText: z.string(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
})
