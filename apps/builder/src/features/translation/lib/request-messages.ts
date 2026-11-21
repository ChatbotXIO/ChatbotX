import {
  inboxTranslationSettingsService,
  translationService,
} from "@chatbotx.io/business"
import {
  AIJobAction,
  aiAgentQueue,
  buildTranslateMessagesJobId,
  getTranslateMessagesJobOptions,
} from "@chatbotx.io/worker-config"
import type { RequestTranslationsRequest } from "../schema/action"
import type { RequestTranslationsResource } from "../schema/resource"
import { isModelAvailable } from "./availability"

/**
 * Asks for inbound messages to be translated. Returns at once with what was
 * queued and what was skipped (and why); the translations arrive later through
 * the worker, as a `messageTranslationUpdated` event for the inbox and in the
 * `translation` field of `messages.list` for an API caller. The caller has
 * already proven access to the conversation.
 */
export async function requestTranslations(props: {
  workspaceId: string
  conversationId: string
  request: RequestTranslationsRequest
}): Promise<RequestTranslationsResource> {
  const { workspaceId, conversationId, request } = props
  const settings = await inboxTranslationSettingsService.get(workspaceId)

  return await translationService.requestMessages({
    workspaceId,
    conversationId,
    refs: request.messages,
    retryFailed: request.retryFailed === true,
    modelAvailable: await isModelAvailable(workspaceId, settings),
    enqueue: async (job) => {
      const jobId = buildTranslateMessagesJobId({
        conversationId,
        messageIds: job.messages.map((message) => message.id),
      })
      await aiAgentQueue.add(
        AIJobAction.translateMessages,
        { type: AIJobAction.translateMessages, data: job },
        getTranslateMessagesJobOptions(jobId),
      )
    },
  })
}
