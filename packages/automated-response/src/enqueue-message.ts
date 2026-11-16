import {
  aiAgentService,
  decisionProfileService,
  workspaceService,
} from "@chatbotx.io/business"
import {
  type FileType,
  isSmartResponseDelayOption,
} from "@chatbotx.io/database/partials"
import { simpleQueue } from "@chatbotx.io/redis"
import { AIJobAction, aiAgentQueue } from "@chatbotx.io/worker-config"
import { getKey } from "./constants"
import { type KeywordMatchInput, matchesAnyKeywordRule } from "./keyword-match"
import { logger } from "./lib/logger"
import {
  isSmartDelayEligible,
  resolveAutomatedResponseTiming,
} from "./smart-delay"
import { automatedResponseService } from "./utils"

const findInboundKeywordRules = async (workspaceId: string) =>
  (await automatedResponseService.getAll(workspaceId)).filter(
    (rule) => rule.type === "inbound",
  )

/**
 * Queues a contact message for Keywords → AI. Returns false when nothing was
 * queued: an image/video/audio without text is queued only when an inbound
 * keyword rule matches it, so the AI agent / Global Router never answer a bare
 * photo or voice note.
 */
export const enqueueMessage = async (props: {
  conversationId: string
  contactInboxId: string
  messageId: string
  messageText?: string
  attachmentFileTypes?: readonly FileType[]
  workspaceId: string
}): Promise<boolean> => {
  const key = getKey(props)
  let timing = resolveAutomatedResponseTiming(null)
  const matchInput: KeywordMatchInput = {
    text: props.messageText || null,
    attachmentFileTypes: props.attachmentFileTypes ?? [],
  }
  const hasMatchInput =
    Boolean(matchInput.text) || matchInput.attachmentFileTypes.length > 0
  let rulesLookup: ReturnType<typeof findInboundKeywordRules> | undefined
  const loadKeywordRules = () => {
    rulesLookup ??= findInboundKeywordRules(props.workspaceId)
    return rulesLookup
  }

  if (!matchInput.text && hasMatchInput) {
    try {
      const keywordRules = await loadKeywordRules()
      if (!matchesAnyKeywordRule(matchInput, keywordRules)) {
        return false
      }
    } catch (error) {
      logger.error(
        { err: error, messageId: props.messageId },
        "Keyword lookup failed for a media-only message",
      )
      return false
    }
  }

  try {
    const workspace = await workspaceService.findById({ id: props.workspaceId })
    const workspaceDelay = workspace?.smartResponseDelaySeconds

    if (isSmartResponseDelayOption(workspaceDelay)) {
      const [keywordRules, aiAgent, hasGlobalRouter] = await Promise.all([
        hasMatchInput ? loadKeywordRules() : Promise.resolve([]),
        aiAgentService.findDefault(props.workspaceId),
        decisionProfileService.hasGlobalRouterEnabled(props.workspaceId),
      ])
      const matchesKeyword =
        hasMatchInput && matchesAnyKeywordRule(matchInput, keywordRules)

      timing = resolveAutomatedResponseTiming(
        isSmartDelayEligible({
          hasAsyncResponder: Boolean(aiAgent) || hasGlobalRouter,
          matchesKeyword,
          workspaceDelay,
        })
          ? workspace
          : null,
      )
    } else {
      timing = resolveAutomatedResponseTiming(workspace)
    }
  } catch (error) {
    logger.warn(error, "Smart delay lookup failed; using default timing")
  }

  try {
    await Promise.all([
      aiAgentQueue.add(
        AIJobAction.processAutomatedResponse,
        {
          type: AIJobAction.processAutomatedResponse,
          data: {
            conversationId: props.conversationId,
            contactInboxId: props.contactInboxId,
            messageId: props.messageId,
          },
        },
        {
          deduplication: {
            id: key,
            ttl: timing.ttlSeconds * 1000,
            extend: true,
            replace: true,
          },
          delay: timing.delaySeconds * 1000,
          jobId: `automated-response-${props.messageId}`,
        },
      ),
      simpleQueue.enqueue(
        key,
        props.messageId,
        timing.ttlSeconds * 5000, // keep the key longer than process job
      ),
    ])
  } catch (error) {
    logger.error(error, "Unable to trigger automated response")
  }
  return true
}
