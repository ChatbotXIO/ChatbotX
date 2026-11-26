import {
  generatePostText as callWriter,
  PostWriterProviderError,
  type PostWriterRequest,
} from "@chatbotx.io/ai/post-writer"
import {
  resolveTranslationModel,
  TranslationIntegrationUnavailableError,
} from "@chatbotx.io/ai/translation"
import {
  inboxTranslationSettingsService,
  languagePromptName,
  normalizeLanguageCode,
  type PostAiFailureCode,
  PostAiProviderFailure,
  type PostAiResult,
  shortestLimit,
  socialPostAiService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { AIAgentModelConfig } from "@chatbotx.io/database/partials"
import { getChildLogger, toLogSafeError } from "@chatbotx.io/logger"
import type { z } from "zod"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import { modelConfigFromChoice } from "../model-choice"
import type { generatePostTextRequest } from "../schema"
import { defaultWritingToggles, uniqueProviders } from "./writing-defaults"

const logger = getChildLogger("social-posts-ai")

/** The provider call aborts after this; the service's in-flight claim outlives it. */
const PROVIDER_TIMEOUT_MS = 15_000
type Request = z.output<typeof generatePostTextRequest>

const failureException = (code: PostAiFailureCode): ChatbotXException => {
  switch (code) {
    case "timeout":
      return new ChatbotXException(
        "The AI model did not answer in time.",
        "aiTimeout",
        504,
      )
    case "rateLimited":
      return new ChatbotXException(
        "The AI provider is rate limiting requests.",
        "aiRateLimited",
        429,
      )
    case "integrationUnavailable":
      return new ChatbotXException(
        "The AI integration is missing, disabled or its credentials are invalid.",
        "aiNeedsReconfiguration",
        409,
      )
    case "emptyOutput":
      return new ChatbotXException(
        "The AI model returned no text.",
        "aiEmptyOutput",
        502,
      )
    default:
      return new ChatbotXException(
        "The AI provider failed to write the text.",
        "aiProviderError",
        502,
      )
  }
}

const languageNameOf = (language: string | undefined): string | null => {
  if (!language) {
    return null
  }
  return languagePromptName(normalizeLanguageCode(language) ?? language)
}

/**
 * The model the caller picked (`integrationId` + `model`, both or neither), or
 * else the one chosen for Inbox translation. Neither: the caller must pick one.
 */
const chosenModelConfig = async (
  request: Request,
  workspaceId: string,
): Promise<AIAgentModelConfig> => {
  if (request.integrationId && request.model) {
    return modelConfigFromChoice({
      integrationId: request.integrationId,
      model: request.model,
    })
  }
  const settings = await inboxTranslationSettingsService.get(workspaceId)
  if (!settings?.modelConfig) {
    throw new ChatbotXException(
      "Choose an AI integration and model to write with AI.",
      "aiModelNotChosen",
      409,
    )
  }
  return settings.modelConfig
}

/**
 * Loads the model before anything is paid for. `resolveTranslationModel` is the
 * check that the integration is this workspace's own, enabled and usable, for
 * a picked model as for the translation one.
 */
const resolveModel = async (request: Request, workspaceId: string) => {
  const modelConfig = await chosenModelConfig(request, workspaceId)
  try {
    return await resolveTranslationModel({ modelConfig, workspaceId })
  } catch (error) {
    if (error instanceof TranslationIntegrationUnavailableError) {
      throw failureException("integrationUnavailable")
    }
    throw error
  }
}

/**
 * Suggests post text. Only returns it: nothing is saved or published. The
 * public API and the composer both call this. Refused in a trial-expired
 * workspace (it spends the workspace's AI key).
 */
export async function generatePostText(props: {
  /** Who is calling (a member id, or the API credential id): the in-flight guard is per actor. */
  actorId: string
  request: Request
  workspace: { id: string; ownerId: string }
}): Promise<PostAiResult> {
  const { request, workspace } = props
  await assertWorkspaceNotBlocked(workspace.ownerId)
  const destinationIds = [...new Set(request.destinationIds ?? [])].sort()
  const limits = await socialPostAiService.limitsForDestinations({
    destinationIds,
    workspaceId: workspace.id,
  })
  const limit = shortestLimit(limits)
  const providers = uniqueProviders(
    request.providers ?? limits.map((item) => item.provider),
  )
  const defaults = defaultWritingToggles(providers)
  const writerRequest: PostWriterRequest = {
    brief: request.brief ?? null,
    callToAction: request.callToAction ?? Boolean(request.callToActionText),
    callToActionText: request.callToActionText ?? null,
    emoji: request.emoji ?? defaults.emoji,
    hashtags: request.hashtags ?? defaults.hashtags,
    languageName: languageNameOf(request.language),
    limit,
    mode: request.mode,
    perNetwork: request.perNetwork ?? false,
    providerLimits: limits,
    providers,
    text: request.text ?? null,
    tone: request.tone ?? null,
    variants: request.variants ?? 1,
  }
  // What decides the output, with the defaults filled in, so the same key
  // with a request that only spells a default differently is still the same call.
  const { idempotencyKey: _key, ...given } = request
  const decisive = {
    ...given,
    callToAction: writerRequest.callToAction,
    emoji: writerRequest.emoji,
    hashtags: writerRequest.hashtags,
    perNetwork: writerRequest.perNetwork,
    providers,
    variants: writerRequest.variants,
  }
  const startedAt = Date.now()
  try {
    const result = await socialPostAiService.generate({
      actorId: props.actorId,
      idempotencyKey: request.idempotencyKey,
      inputChars:
        (request.text?.length ?? 0) +
        (request.brief?.length ?? 0) +
        (request.callToActionText?.length ?? 0),
      limits,
      prepare: () => resolveModel(request, workspace.id),
      produce: async (resolved) => {
        try {
          return await callWriter({
            model: resolved.model,
            request: writerRequest,
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
          })
        } catch (error) {
          if (error instanceof PostWriterProviderError) {
            throw new PostAiProviderFailure(error.code, error)
          }
          throw error
        }
      },
      request: { ...decisive, destinationIds },
      workspaceId: workspace.id,
    })
    // Counts only: never the prompt or the answer.
    logger.info(
      {
        action: "generatePostText",
        elapsedMs: Date.now() - startedAt,
        inputChars: result.usage.inputChars,
        mode: request.mode,
        outputChars: result.usage.outputChars,
        truncated: result.truncated,
        workspaceId: workspace.id,
      },
      "[social-posts-ai] text suggested",
    )
    return result
  } catch (error) {
    if (error instanceof PostAiProviderFailure) {
      logger.warn(
        {
          action: "generatePostText",
          err: toLogSafeError(error.cause ?? error),
          mode: request.mode,
          reason: error.code,
          workspaceId: workspace.id,
        },
        "[social-posts-ai] writing failed",
      )
      throw failureException(error.code)
    }
    throw error
  }
}
