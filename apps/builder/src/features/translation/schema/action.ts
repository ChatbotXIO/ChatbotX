import { aiAgentModelConfig } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { translationLanguage, translationMessageRef } from "./resource"

export const MAX_TRANSLATION_REQUEST_MESSAGES = 20

/** Fields that make a message more than plain text; `translate` does not apply to them. */
export const TRANSLATE_NON_TEXT_FIELDS = [
  "files",
  "mediaFile",
  "mediaFileId",
  "mediaFileIds",
  "products",
  "flowId",
  "replyToMessageId",
  "isPrivateReply",
] as const

export const TRANSLATE_PLAIN_TEXT_ONLY_MESSAGE =
  "`translate` only applies to a plain text message: no files, media, products, flow, reply or private reply"

export const updateTranslationSettingsRequest = z.object({
  enabled: z
    .boolean()
    .describe(
      "Turn Inbox translation on or off. Turning it on needs `modelConfig`.",
    ),
  modelConfig: aiAgentModelConfig
    .nullable()
    .describe(
      'AI provider and model: `{ provider, model }` for a connected provider (`openai`, `gemini`, `claude`, `deepseek`, `openrouter`, `muse`), or `{ kind: "openaiCompatible", integrationId, model }`. Connect the integration first (`connections.list`). `null` clears the choice.',
    ),
})
export type UpdateTranslationSettingsRequest = z.infer<
  typeof updateTranslationSettingsRequest
>

export const testTranslationSettingsRequest = z.object({
  modelConfig: aiAgentModelConfig.describe(
    "The model to try, same shape as in `translation.updateSettings`. It does not have to be saved yet.",
  ),
  sampleText: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe("Text to translate. Defaults to a short Spanish greeting."),
})
export type TestTranslationSettingsRequest = z.infer<
  typeof testTranslationSettingsRequest
>

export const conversationIdParam = z.object({
  conversationId: zodBigintAsString().describe(
    "Conversation id (`conversations.list`).",
  ),
})

export const updateConversationTranslationStateRequest = z.object({
  enabledOverride: z
    .boolean()
    .nullable()
    .optional()
    .describe(
      "`false` turns translation off for this conversation. `true` turns it on in the Inbox, which otherwise leaves a conversation untranslated while a bot handles it or an agent has taken it over from the bot for a while; it is cleared when the bot takes the conversation back. `null` clears the choice. Neither can enable a workspace that has translation off.",
    ),
  language: translationLanguage
    .optional()
    .describe(
      "Set the customer's language by hand. It replaces a detected language and is never overwritten by detection afterwards.",
    ),
})
export type UpdateConversationTranslationStateRequest = z.infer<
  typeof updateConversationTranslationStateRequest
>

export const requestTranslationsRequest = z.object({
  messages: z
    .array(translationMessageRef)
    .min(1)
    .max(MAX_TRANSLATION_REQUEST_MESSAGES)
    .describe(
      "Up to 20 inbound text messages to translate, as `{ id, createdAt }` from `messages.list`.",
    ),
  retryFailed: z
    .boolean()
    .optional()
    .describe("Also retry messages whose earlier translation failed."),
})
export type RequestTranslationsRequest = z.infer<
  typeof requestTranslationsRequest
>

export const previewTranslationRequest = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .describe(
      "The sentence an agent is about to send, in the workspace language.",
    ),
})
export type PreviewTranslationRequest = z.infer<
  typeof previewTranslationRequest
>
