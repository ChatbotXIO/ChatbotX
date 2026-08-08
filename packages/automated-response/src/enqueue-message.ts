import { aiAgentService, workspaceService } from "@chatbotx.io/business"
import { isSmartResponseDelayOption } from "@chatbotx.io/database/partials"
import { simpleQueue } from "@chatbotx.io/redis"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { getKey } from "./constants"
import { matchesAnyKeywordRule } from "./keyword-match"
import { logger } from "./lib/logger"
import {
  isSmartDelayEligible,
  resolveAutomatedResponseTiming,
} from "./smart-delay"
import { automatedResponseService } from "./utils"

export const enqueueMessage = async (props: {
  conversationId: string
  contactInboxId: string
  messageId: string
  messageText?: string
  workspaceId: string
}) => {
  const key = getKey(props)
  let timing = resolveAutomatedResponseTiming(null)

  try {
    const workspace = await workspaceService.findById({ id: props.workspaceId })
    const workspaceDelay = workspace?.smartResponseDelaySeconds

    if (isSmartResponseDelayOption(workspaceDelay)) {
      const [allAutomatedResponses, aiAgent] = await Promise.all([
        props.messageText
          ? automatedResponseService.getAll(props.workspaceId)
          : Promise.resolve([]),
        aiAgentService.findDefault(props.workspaceId),
      ])
      const keywordRules = allAutomatedResponses.filter(
        (rule) => rule.type === "inbound",
      )
      const matchesKeyword = props.messageText
        ? matchesAnyKeywordRule(props.messageText, keywordRules)
        : false

      timing = resolveAutomatedResponseTiming(
        isSmartDelayEligible({
          hasAiAgent: Boolean(aiAgent),
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
      integrationQueue.add(
        IntegrationJobAction.processAutomatedResonse,
        {
          type: IntegrationJobAction.processAutomatedResonse,
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
}
