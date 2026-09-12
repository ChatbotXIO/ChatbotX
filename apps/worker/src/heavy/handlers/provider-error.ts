import { logProviderError } from "@chatbotx.io/business/error-log"
import { normalizeError } from "universal-error-normalizer"
import type { AIStepProvider } from "../../integration/handlers/shared/ai-error-log-provider"
import { aiErrorLogProvider } from "../../integration/handlers/shared/ai-error-log-provider"
import { logger } from "../../lib/logger"

export async function recordHeavyAIStepProviderError(input: {
  contactId: string
  /** The contact's channel-side id (`ContactInbox.sourceId`). */
  sourceId?: string | null
  error: unknown
  provider: AIStepProvider
  workspaceId: string
}): Promise<void> {
  try {
    await logProviderError({
      provider: aiErrorLogProvider(input.provider),
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      sourceId: input.sourceId,
      // Raw, never normalized: `normalizeError` returns a plain object, so the
      // service's `error instanceof Error` check fails and `stackTrace` is
      // written NULL — and its `status` field is not one of the keys the
      // service reads for `httpCode`. `logStepProviderError` passes raw too.
      //
      // `detail` moves too, for the throws that are not `Error`s: the service's
      // `resolveMessage` reads a top-level `message` and otherwise falls back to
      // `UNKNOWN_ERROR_DETAIL`, where `normalizeError` also dug a message out of
      // axios-shaped errors. Nothing on this path throws one — the heavy AI
      // handlers throw AI-SDK `Error`s, which carry their own message — and the
      // service is where an SDK shape should be taught, not here.
      error: input.error,
    })
  } catch (error) {
    logger.warn(
      {
        err: normalizeError(error),
        provider: input.provider,
        workspaceId: input.workspaceId,
        contactId: input.contactId,
      },
      "Failed to persist heavy AI provider error",
    )
  }
}
