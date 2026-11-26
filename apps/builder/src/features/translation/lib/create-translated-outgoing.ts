import {
  isSameLanguage,
  isWithinChannelLimit,
  messageService,
  queueWorkspaceRealtimeEvent,
  translationService,
} from "@chatbotx.io/business"
import { validationException } from "@chatbotx.io/business/errors"
import type {
  ContactInboxModel,
  ConversationModel,
  UserModel,
} from "@chatbotx.io/database/types"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  RealtimeEventType,
  routeForConversation,
} from "@chatbotx.io/realtime-protocol"
import {
  TRANSLATE_NON_TEXT_FIELDS,
  TRANSLATE_PLAIN_TEXT_ONLY_MESSAGE,
} from "../schema/action"
import {
  TRANSLATION_PROVIDER_FAILURE_CODES,
  type TranslationApiErrorCode,
} from "../schema/errors"
import type { MessageTranslationResource } from "../schema/resource"
import {
  conversationTranslation,
  isTranslationEffectiveFor,
  loadTranslationContext,
} from "./availability"
import { updateConversationTranslationState } from "./conversation-state"
import { TranslationNotSentException } from "./errors"
import { toMessageTranslationResource } from "./message-translations"
import {
  OUTBOUND_TRANSLATION_TIMEOUT_MS,
  translateText,
} from "./translate-text"

const logger = getChildLogger("translation")

type CreateOutgoingArgs = Parameters<typeof messageService.createOutgoing>[0]
type OutgoingInput = CreateOutgoingArgs["input"]

/** The agent's hand-edited translation from the composer preview. */
export type EditedTranslation = { text: string; targetLanguage: string }

export type TranslatedOutgoingResult = {
  message: Awaited<ReturnType<typeof messageService.createOutgoing>>
  /** The row stored for this message; `null` when it went out as written. */
  translation: MessageTranslationResource
  /**
   * Why the sentence was sent as written: translation is off for the
   * conversation or the customer's language is unknown. A translation that
   * failed is never a fallback: the message is not sent at all.
   */
  translationFallback: { reason: TranslationApiErrorCode } | null
  /** The hand-edited translation targeted a language the conversation no longer has. */
  editedTranslationDiscarded: boolean
}

const plainTextOf = (input: OutgoingInput): string => {
  const hasOtherContent = TRANSLATE_NON_TEXT_FIELDS.some(
    (field) => field in input && input[field as keyof typeof input] != null,
  )
  const text = "text" in input ? input.text : undefined
  if (hasOtherContent || typeof text !== "string" || text.length === 0) {
    throw validationException("translate", TRANSLATE_PLAIN_TEXT_ONLY_MESSAGE)
  }
  return text
}

/**
 * Sends an agent's text message translated into the customer's language. When
 * translation is off for the conversation or the language is unknown it goes
 * out as written. When the translation itself fails (no answer within 10 s, a
 * provider error, a rate limit, an unusable answer) nothing is sent: it throws
 * {@link TranslationNotSentException} and the agent sends again. A failure of
 * the AI provider's API also turns translation off for the conversation, so
 * that next send goes out as written.
 *
 * The message is created exactly once, with the translation as its `text` and
 * the agent's sentence as `automationText` (keyword rules keep matching what the
 * agent wrote). The agent's sentence is stored only after the send succeeded, in
 * a `MessageTranslation` row, so a failed create leaves nothing behind; the
 * channel never sees it.
 */
export async function createOutgoingWithTranslation(props: {
  workspaceId: string
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  input: OutgoingInput
  editedTranslation?: EditedTranslation
  user?: Pick<UserModel, "id">
  sendFrom: CreateOutgoingArgs["sendFrom"]
}): Promise<TranslatedOutgoingResult> {
  const { workspaceId, conversation, contactInbox, input } = props
  const original = plainTextOf(input)
  const startedAt = Date.now()

  const sendAsWritten = async (
    reason: TranslationApiErrorCode | null,
  ): Promise<TranslatedOutgoingResult> => ({
    message: await messageService.createOutgoing({
      conversation,
      contactInbox,
      input,
      ...(props.user && { user: props.user }),
      sendFrom: props.sendFrom,
    }),
    translation: null,
    translationFallback: reason ? { reason } : null,
    editedTranslationDiscarded: false,
  })

  const { settings, workspaceLanguage } =
    await loadTranslationContext(workspaceId)
  if (!isTranslationEffectiveFor(settings, conversation)) {
    return await sendAsWritten("disabled")
  }
  const targetLanguage = conversationTranslation(conversation)?.language
  if (!targetLanguage) {
    return await sendAsWritten("unknownLanguage")
  }
  if (isSameLanguage(targetLanguage, workspaceLanguage)) {
    // Nothing to translate: the customer reads the workspace language.
    return await sendAsWritten(null)
  }

  const { editedTranslation } = props
  const useEdited =
    editedTranslation !== undefined &&
    isSameLanguage(editedTranslation.targetLanguage, targetLanguage)
  const editedTranslationDiscarded =
    editedTranslation !== undefined && !useEdited

  let translated: string
  let modelId: string | null = null
  if (useEdited) {
    // The agent reviewed and edited this text in the preview: send it as is.
    translated = editedTranslation.text
    if (!isWithinChannelLimit(contactInbox.channel, translated)) {
      throw new TranslationNotSentException({
        reason: "tooLong",
        conversationTranslation: "on",
      })
    }
  } else {
    const translateStartedAt = Date.now()
    const result = await translateText({
      workspaceId,
      modelConfig: settings?.modelConfig ?? null,
      text: original,
      targetLanguage,
      channel: contactInbox.channel,
      timeoutMs: OUTBOUND_TRANSLATION_TIMEOUT_MS,
    })
    // Where the wait of an outgoing message goes: lookups before the call, the
    // provider call itself, and everything after it (never message text).
    logger.info(
      {
        workspaceId,
        conversationId: conversation.id,
        action: "outboundTiming",
        ok: result.ok,
        reason: result.ok ? null : result.code,
        beforeTranslateMs: translateStartedAt - startedAt,
        translateMs: Date.now() - translateStartedAt,
      },
      "[translation] outgoing message translation timing",
    )
    if (!result.ok) {
      throw await notSentAfterFailure({
        workspaceId,
        conversation,
        reason: result.code,
      })
    }
    translated = result.text
    modelId = result.modelId
  }

  const message = await messageService.createOutgoing({
    conversation,
    contactInbox,
    input: { ...input, text: translated, automationText: original },
    ...(props.user && { user: props.user }),
    sendFrom: props.sendFrom,
  })

  const row = await recordAgentSentence({
    workspaceId,
    conversation,
    message,
    agentText: original,
    sourceLanguage: workspaceLanguage,
    targetLanguage,
    modelId,
  })

  return {
    message,
    translation: row ? toMessageTranslationResource(row) : null,
    translationFallback: null,
    editedTranslationDiscarded,
  }
}

/**
 * The error for a send whose translation failed. When the AI provider's API is
 * at fault, translation is turned off for the conversation first (and every
 * open inbox told), so the agent's next message goes out as written. Turning it
 * off is best effort: if that write fails, the message is still reported as not
 * sent, with translation left on.
 */
async function notSentAfterFailure(props: {
  workspaceId: string
  conversation: ConversationModel
  reason: TranslationApiErrorCode
}): Promise<TranslationNotSentException> {
  const { workspaceId, conversation, reason } = props
  if (!TRANSLATION_PROVIDER_FAILURE_CODES.has(reason)) {
    return new TranslationNotSentException({
      reason,
      conversationTranslation: "on",
    })
  }
  try {
    await updateConversationTranslationState({
      workspaceId,
      conversation,
      request: { enabledOverride: false },
    })
  } catch (err) {
    logger.warn(
      {
        err,
        workspaceId,
        conversationId: conversation.id,
        action: "turnOffAfterProviderFailure",
        reason,
      },
      "[translation] could not turn translation off after a provider failure",
    )
    return new TranslationNotSentException({
      reason,
      conversationTranslation: "on",
    })
  }
  logger.info(
    {
      workspaceId,
      conversationId: conversation.id,
      action: "turnOffAfterProviderFailure",
      reason,
    },
    "[translation] turned translation off for a conversation after a provider failure",
  )
  return new TranslationNotSentException({
    reason,
    conversationTranslation: "off",
  })
}

/**
 * Stores what the agent typed and tells other inbox tabs. The message is
 * already sent, so a failure here is logged and never turned into a failed
 * send: the worst case is a bubble that shows the translation without the
 * agent's original sentence.
 */
async function recordAgentSentence(props: {
  workspaceId: string
  conversation: ConversationModel
  message: { id: string; createdAt: Date } | null
  agentText: string
  sourceLanguage: string
  targetLanguage: string
  modelId: string | null
}) {
  const { workspaceId, conversation, message } = props
  if (!message) {
    return null
  }
  try {
    const row = await translationService.recordOutbound({
      workspaceId,
      conversationId: conversation.id,
      message: { id: message.id, createdAt: message.createdAt },
      agentText: props.agentText,
      sourceLanguage: props.sourceLanguage,
      targetLanguage: props.targetLanguage,
      modelId: props.modelId,
    })
    if (row) {
      await queueWorkspaceRealtimeEvent(workspaceId, {
        eventType: RealtimeEventType.messageTranslationUpdated,
        data: {
          conversationId: conversation.id,
          items: [
            {
              messageId: row.messageId,
              status: row.status,
              displayText: row.displayText,
              sourceLanguage: row.sourceLanguage,
              targetLanguage: row.targetLanguage,
            },
          ],
        },
        route: routeForConversation(conversation),
      })
    }
    return row
  } catch (err) {
    logger.warn(
      {
        err,
        workspaceId,
        conversationId: conversation.id,
        messageId: message.id,
        action: "recordAgentSentence",
      },
      "[translation] could not store the agent's original sentence",
    )
    return null
  }
}
