import type { MessageTranslationFailureCode } from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  type MessageForTranslation,
  type MessageRef,
  messageTranslationRepository,
} from "@chatbotx.io/database/repositories"
import type { MessageTranslationModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { conversationService } from "../conversation/service"
import { validationException } from "../errors"
import { workspaceService } from "../workspace/service"
import {
  isReliableDetection,
  isSameLanguage,
  isTranslationEffective,
  normalizeLanguageCode,
} from "./language-policy"
import {
  claimInflight,
  classifyTranslationRequest,
  clearInflight,
  MAX_REQUEST_MESSAGES,
  releaseInflight,
  type TranslationAvailability,
} from "./request-guard"
import { inboxTranslationSettingsService } from "./settings-service"
import type { TranslationSkipReason } from "./skip-reasons"

const CONTEXT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000

/** What the caller must queue for the messages the guard accepted. */
export type TranslationJobRequest = {
  workspaceId: string
  conversationId: string
  messages: MessageRef[]
  retryFailed: boolean
  /** The value of every in-flight marker this request claimed. */
  requestId: string
}

export type RequestMessagesResult = {
  accepted: string[]
  skipped: { id: string; reason: TranslationSkipReason }[]
}

/** One message's outcome from a translation job, as the worker hands it over. */
export type TranslationJobItem =
  | {
      kind: "translated"
      messageId: string
      messageCreatedAt: Date
      /** The message text the translation was made from (reliability is judged on it). */
      text: string
      sourceHash: string
      detectedLanguage: string
      confidence: number
      /** Already restored (fragments put back). */
      translatedText: string
      modelId: string
    }
  | {
      kind: "failed"
      messageId: string
      messageCreatedAt: Date
      sourceHash: string | null
      failureCode: MessageTranslationFailureCode
      modelId: string | null
    }

export type ApplyResultsOutcome = {
  /** Rows now stored. A message whose existing row was kept is absent. */
  rows: MessageTranslationModel[]
  /** Set only when this call set or upgraded the conversation language. */
  conversationLanguage?: string
}

/**
 * Inbox translation: deciding which inbound messages to translate, and storing
 * what the worker produced. It never calls a model: `@chatbotx.io/ai` depends
 * on this package, so provider calls live there, in the builder, or in the
 * worker, and reach this service as plain data.
 */
class TranslationService extends BaseService {
  /**
   * Filters the requested messages and claims the ones worth translating.
   *
   * `enqueue` is supplied by the caller (it owns the queue) and receives only
   * what was accepted. Markers are claimed before it runs; if it throws they
   * are released again so a failed `add` leaves no orphaned lock.
   */
  async requestMessages(input: {
    workspaceId: string
    conversationId: string
    refs: MessageRef[]
    retryFailed: boolean
    /** `false` when the configured integration cannot be resolved (checked by the caller via `@chatbotx.io/ai`). */
    modelAvailable: boolean
    enqueue: (job: TranslationJobRequest) => Promise<void>
  }): Promise<RequestMessagesResult> {
    const { workspaceId, conversationId, refs, retryFailed } = input
    if (refs.length > MAX_REQUEST_MESSAGES) {
      throw validationException(
        "messages",
        `At most ${MAX_REQUEST_MESSAGES} messages per request`,
      )
    }
    if (refs.length === 0) {
      return { accepted: [], skipped: [] }
    }

    const [settings, workspace, conversation] = await Promise.all([
      inboxTranslationSettingsService.get(workspaceId),
      workspaceService.find({ where: { id: workspaceId } }),
      conversationService.findBy({
        where: { id: conversationId, workspaceId },
      }),
    ])
    if (!(workspace && conversation)) {
      throw validationException("conversationId", "Conversation not found")
    }

    const effective = isTranslationEffective({
      workspaceEnabled: settings?.enabled === true,
      enabledOverride:
        conversation.additionalAttributes?.translation?.enabledOverride,
    })
    let availability: TranslationAvailability = "ok"
    if (!effective) {
      availability = "disabled"
    } else if (!input.modelAvailable) {
      availability = "unavailable"
    }

    // Skip the reads entirely when nothing can be translated.
    const needsReads = availability === "ok"
    const repository = needsReads ? await createMessageRepository() : null
    const [messages, translations] = repository
      ? await Promise.all([
          repository.findManyForTranslation(workspaceId, refs),
          messageTranslationRepository.findByMessageIds(
            workspaceId,
            refs.map((ref) => ref.id),
          ),
        ])
      : [[], []]

    const decisions = classifyTranslationRequest({
      conversationId,
      refs,
      messages,
      translations,
      workspaceLanguage: workspace.language,
      retryFailed,
      availability,
    })

    const requestId = createId()
    const accepted: MessageRef[] = []
    const skipped: RequestMessagesResult["skipped"] = []
    for (const decision of decisions) {
      if (!decision.accepted) {
        skipped.push({ id: decision.id, reason: decision.reason })
        continue
      }
      if (await claimInflight(workspaceId, decision.id, requestId)) {
        accepted.push(decision.ref)
      } else {
        skipped.push({ id: decision.id, reason: "inFlight" })
      }
    }

    if (accepted.length > 0) {
      try {
        await input.enqueue({
          workspaceId,
          conversationId,
          messages: accepted,
          retryFailed,
          requestId,
        })
      } catch (error) {
        await Promise.all(
          accepted.map((ref) =>
            releaseInflight(workspaceId, ref.id, requestId),
          ),
        )
        throw error
      }
    }

    return { accepted: accepted.map((ref) => ref.id), skipped }
  }

  /** The messages a job was asked to translate, read by their shard key. */
  async findMessages(
    workspaceId: string,
    refs: MessageRef[],
  ): Promise<MessageForTranslation[]> {
    const repository = await createMessageRepository()
    return await repository.findManyForTranslation(workspaceId, refs)
  }

  findTranslations(
    workspaceId: string,
    messageIds: string[],
  ): Promise<MessageTranslationModel[]> {
    return messageTranslationRepository.findByMessageIds(
      workspaceId,
      messageIds,
    )
  }

  /**
   * Up to `limit` earlier inbound direct-text messages before `before`, oldest
   * first: language context for the translator (never translated, never
   * stored). Looks back at most {@link CONTEXT_LOOKBACK_MS} so a quiet
   * conversation does not scan every shard.
   */
  async findLanguageContext(input: {
    workspaceId: string
    conversationId: string
    before: Date
    limit: number
  }): Promise<string[]> {
    const repository = await createMessageRepository()
    const earlier = await repository.findInboundTextBefore({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      before: input.before,
      sinceTime: new Date(input.before.getTime() - CONTEXT_LOOKBACK_MS),
      limit: input.limit,
    })
    return earlier.map((message) => message.text).reverse()
  }

  /**
   * Stores a job's results and, from the earliest reliable detection, sets the
   * conversation language. A language the same as the workspace's becomes a
   * `skipped` row (nothing to show) so the next open does not ask again.
   * `targetLanguage` is stored as `Workspace.language` verbatim, which is what
   * the inbox compares against to know a row is stale.
   */
  async applyResults(input: {
    workspaceId: string
    conversationId: string
    items: TranslationJobItem[]
  }): Promise<ApplyResultsOutcome> {
    const { workspaceId, conversationId, items } = input
    if (items.length === 0) {
      return { rows: [] }
    }
    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (!workspace) {
      throw validationException("workspaceId", "Workspace not found")
    }
    const workspaceLanguage = workspace.language

    const rows: MessageTranslationModel[] = []
    for (const item of items) {
      const base = {
        workspaceId,
        conversationId,
        messageId: item.messageId,
        messageCreatedAt: item.messageCreatedAt,
        direction: "inbound" as const,
        targetLanguage: workspaceLanguage,
        sourceHash: item.sourceHash,
        modelId: item.modelId,
      }
      const row =
        item.kind === "failed"
          ? await messageTranslationRepository.upsertResult({
              ...base,
              status: "failed",
              sourceLanguage: null,
              confidence: null,
              displayText: null,
              failureCode: item.failureCode,
            })
          : await messageTranslationRepository.upsertResult({
              ...base,
              ...this.translatedColumns(item, workspaceLanguage),
            })
      if (row) {
        rows.push(row)
      }
    }

    const conversationLanguage = await this.detectConversationLanguage({
      workspaceId,
      conversationId,
      workspaceLanguage,
      items,
    })
    return conversationLanguage ? { rows, conversationLanguage } : { rows }
  }

  /**
   * The row for a translator answer. A message already in the workspace
   * language is `skipped` (its answer is not used). An empty answer is not a
   * translation: stored as `translated` it would show nothing and never be
   * asked for again, so it is `failed` (`unsafeOutput`) and can be retried.
   */
  private translatedColumns(
    item: Extract<TranslationJobItem, { kind: "translated" }>,
    workspaceLanguage: string,
  ) {
    const sourceLanguage = normalizeLanguageCode(item.detectedLanguage)
    if (isSameLanguage(sourceLanguage, workspaceLanguage)) {
      return {
        status: "skipped" as const,
        sourceLanguage,
        confidence: item.confidence,
        displayText: null,
        failureCode: null,
      }
    }
    if (item.translatedText.trim() === "") {
      return {
        status: "failed" as const,
        sourceLanguage,
        confidence: item.confidence,
        displayText: null,
        failureCode: "unsafeOutput" as const,
      }
    }
    return {
      status: "translated" as const,
      sourceLanguage,
      confidence: item.confidence,
      displayText: item.translatedText,
      failureCode: null,
    }
  }

  /** The earliest reliable detection decides; the write itself is conditional (`setLanguageIfUnset`). */
  private async detectConversationLanguage(input: {
    workspaceId: string
    conversationId: string
    workspaceLanguage: string
    items: TranslationJobItem[]
  }): Promise<string | null> {
    const earliest = input.items
      .filter(
        (item): item is Extract<TranslationJobItem, { kind: "translated" }> =>
          item.kind === "translated" && isReliableDetection(item.text, item),
      )
      .sort(
        (a, b) => a.messageCreatedAt.getTime() - b.messageCreatedAt.getTime(),
      )[0]
    const language = normalizeLanguageCode(earliest?.detectedLanguage)
    const workspaceLanguage = normalizeLanguageCode(input.workspaceLanguage)
    if (!(earliest && language && workspaceLanguage)) {
      return null
    }

    const updated = await conversationService.setTranslationLanguageIfUnset({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      language,
      workspaceLanguage,
    })
    return updated ? language : null
  }

  /**
   * Remembers what the agent actually typed for an outgoing message whose
   * stored `Message.text` is the translation sent to the customer. Written only
   * after the send succeeded, so a failed send leaves no row. `displayText` is
   * the agent's own sentence (the inbox shows it first, the sent text below).
   */
  recordOutbound(input: {
    workspaceId: string
    conversationId: string
    message: MessageRef
    agentText: string
    /** `Workspace.language`: what the agent wrote in. */
    sourceLanguage: string
    /** The customer language the message was sent in. */
    targetLanguage: string
    /** `null` when the agent supplied the translation by hand. */
    modelId: string | null
  }): Promise<MessageTranslationModel | null> {
    return messageTranslationRepository.upsertResult({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      messageId: input.message.id,
      messageCreatedAt: input.message.createdAt,
      direction: "outbound",
      status: "translated",
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      confidence: null,
      displayText: input.agentText,
      modelId: input.modelId,
      failureCode: null,
      sourceHash: null,
    })
  }

  /**
   * The customer edited or unsent a message: drops its translation and any
   * in-flight claim so the next request is accepted. Returns whether a row was
   * removed.
   */
  async deleteForMessage(input: {
    workspaceId: string
    messageId: string
  }): Promise<boolean> {
    const [deleted] = await Promise.all([
      messageTranslationRepository.deleteByMessageId(
        input.workspaceId,
        input.messageId,
      ),
      clearInflight(input.workspaceId, input.messageId),
    ])
    return deleted
  }
}

export const translationService = new TranslationService()
