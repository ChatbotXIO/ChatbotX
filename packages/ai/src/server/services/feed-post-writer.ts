import {
  type FeedAiModelChecker,
  type FeedPostWriter,
  inboxTranslationSettingsService,
  PostAiProviderFailure,
  shortestLimit,
  socialPostAiService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type AIAgentModelConfig,
  aiAgentProviders,
} from "@chatbotx.io/database/partials"
import { briefOf } from "./feed-post-brief"
import type { PostWriterRequest } from "./post-writer"
import { generatePostText, PostWriterProviderError } from "./post-writer"
import {
  resolveTranslationModel,
  TranslationIntegrationUnavailableError,
} from "./translation-model"

/** The provider call aborts after this; a slow model never holds a feed check. */
const PROVIDER_TIMEOUT_MS = 20_000
const OPENAI_COMPATIBLE_ID = /^\d{1,30}$/

const modelConfigFromChoice = (
  integrationId: string,
  model: string,
): AIAgentModelConfig => {
  const provider = aiAgentProviders.safeParse(integrationId)
  if (provider.success) {
    return { model, provider: provider.data }
  }
  if (!OPENAI_COMPATIBLE_ID.test(integrationId)) {
    throw new ChatbotXException(
      "The AI integration is not valid.",
      "aiNeedsReconfiguration",
      409,
    )
  }
  return { integrationId, kind: "openaiCompatible", model }
}

/**
 * Whether `integrationId` + `model` name a usable integration of THIS
 * workspace (the same resolution the composer's "Write with AI" runs before
 * anything is paid for). False for a foreign, disabled or malformed id; any
 * other failure (database, network) is thrown, not reported as "not found".
 */
export const isFeedAiModelUsable: FeedAiModelChecker = async (input) => {
  try {
    await resolveTranslationModel({
      modelConfig: modelConfigFromChoice(input.integrationId, input.model),
      workspaceId: input.workspaceId,
    })
    return true
  } catch (error) {
    if (
      error instanceof TranslationIntegrationUnavailableError ||
      error instanceof ChatbotXException
    ) {
      return false
    }
    throw error
  }
}

/**
 * The text of a feed item's post, written by the model the feed picked (or the
 * one chosen for Inbox translation) through the same guarded path as the
 * composer's "Write with AI": the workspace's AI rate limits apply, a repeat
 * of the same item is replayed instead of paid twice, and the answer is cut to
 * the shortest limit of the feed's networks. One shared text for every network.
 * Throws when it cannot write; the caller falls back to the text template.
 */
export const writeFeedPost: FeedPostWriter = async (input) => {
  const limits = await socialPostAiService.limitsForDestinations({
    destinationIds: [...new Set(input.destinationIds)].sort(),
    workspaceId: input.workspaceId,
  })
  const providers = [...new Set(limits.map((item) => item.provider))].sort()
  const brief = briefOf(input)
  const request: PostWriterRequest = {
    brief,
    callToAction: false,
    callToActionText: null,
    emoji: true,
    hashtags: false,
    languageName: null,
    limit: shortestLimit(limits),
    mode: "write",
    perNetwork: false,
    providerLimits: limits,
    providers,
    text: null,
    tone: null,
    variants: 1,
  }
  const resolveModel = async () => {
    let config: AIAgentModelConfig | undefined
    if (input.integrationId && input.model) {
      config = modelConfigFromChoice(input.integrationId, input.model)
    } else {
      config =
        (await inboxTranslationSettingsService.get(input.workspaceId))
          ?.modelConfig ?? undefined
    }
    if (!config) {
      throw new ChatbotXException(
        "Choose an AI integration and model to write with AI.",
        "aiModelNotChosen",
        409,
      )
    }
    return await resolveTranslationModel({
      modelConfig: config,
      workspaceId: input.workspaceId,
    })
  }
  const result = await socialPostAiService.generate({
    actorId: `feed-${input.actorId}`,
    idempotencyKey: input.idempotencyKey,
    inputChars: brief.length,
    limits,
    prepare: resolveModel,
    produce: async (resolved) => {
      try {
        return await generatePostText({
          model: resolved.model,
          request,
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        })
      } catch (error) {
        if (error instanceof PostWriterProviderError) {
          throw new PostAiProviderFailure(error.code, error)
        }
        throw error
      }
    },
    request: { ...request, destinationIds: input.destinationIds },
    workspaceId: input.workspaceId,
  })
  return result.text
}
