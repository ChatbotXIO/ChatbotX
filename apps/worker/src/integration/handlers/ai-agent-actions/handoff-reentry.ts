import { aiTimeouts } from "@chatbotx.io/ai"
import { automatedResponseService } from "@chatbotx.io/automated-response"
import {
  aiAgentService,
  conversationService,
  workspaceService,
} from "@chatbotx.io/business"
import {
  type AIAgentProviderModels,
  aiAgentActionRulesSchema,
} from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import { emit } from "@chatbotx.io/event-bus"
import { distributedLock } from "@chatbotx.io/redis"
import type { AIJobProcessHandoffReentry } from "@chatbotx.io/worker-config"
import { stepCountIs, streamText } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { createReplyModel, getProviderName } from "../../../lib/ai/reply-model"
import { detectConversationAndContactInbox } from "../../../lib/db"
import { logger } from "../../../lib/logger"
import { TRIGGER_MESSAGE_LOOKBACK_MS } from "../shared/trigger-message"
import {
  createHandoffReentrySelectionTool,
  type HandoffReentrySelection,
  hasValidHandoffReentryEvidence,
} from "./handoff-reentry-selection"
import { buildHandoffReentryClassifierPrompt } from "./prompt"
import { createAIAgentActionsTool } from "./tool-executor"

const LOCK_TIMEOUT_SECONDS = 90
const CLASSIFIER_MAX_OUTPUT_TOKENS = 128

type HandoffReentryOutcome =
  | "already_enabled"
  | "invalid_trigger_message"
  | "no_default_agent"
  | "no_eligible_rule"
  | "no_match"
  | "executed"
  | "provider_unavailable"
  | "workspace_inactive"

type HandoffReentryOutcomeContext = {
  agentId?: string
  conversationId: string
  contactId: string
  messageId: string
  modelId?: string
  outcome: HandoffReentryOutcome
  provider?: string
  reason?: string
  ruleCount?: number
  workspaceId: string
}

const FAILURE_OUTCOMES = new Set<HandoffReentryOutcome>([
  "workspace_inactive",
  "invalid_trigger_message",
  "no_default_agent",
  "no_eligible_rule",
  "no_match",
  "provider_unavailable",
])

function eligibleRules(
  rules: ReturnType<typeof aiAgentActionRulesSchema.parse>,
) {
  return rules.filter(
    (rule) =>
      rule.actions.length === 1 && rule.actions[0]?.type === "transfer_to_bot",
  )
}

function logOutcome(input: HandoffReentryOutcomeContext) {
  logger.info(
    {
      ...input,
      actionToolAvailable: (input.ruleCount ?? 0) > 0,
      actionToolCalled:
        input.outcome === "executed" || input.outcome === "no_match",
    },
    "[ai-agent-actions] handoff re-entry outcome",
  )
}

async function completeOutcome(
  input: HandoffReentryOutcomeContext,
): Promise<void> {
  logOutcome(input)
  if (!FAILURE_OUTCOMES.has(input.outcome)) {
    return
  }

  await emit("analytics:dashboard", {
    eventType: "message:bot_received",
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    occurredAt: new Date(),
    hasResponse: false,
    responseType: "none",
    routeType: "fallback",
    result: "fallback",
    aiProvider: input.provider ?? "none",
    metadata: {
      latency: 0,
      fallbackReason: "handler_error_to_fallback",
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "processHandoffReentry",
        triggerType: `ai_agent_handoff_reentry_${input.outcome}`,
      },
    },
  })
}

/**
 * Runs only while an explicit human handoff is still active. This is not a
 * reply pass: it has one forced selection tool and can only enable the bot
 * after the selected rule's evidence is validated against the trigger message.
 */
export async function processHandoffReentry(
  props: AIJobProcessHandoffReentry["data"],
): Promise<void> {
  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId: props.conversationId,
      contactInboxId: props.contactInboxId,
    })

  const workspace = await workspaceService.findById({
    id: conversation.workspaceId,
  })
  if (!workspaceService.isActiveNow(workspace)) {
    await completeOutcome({
      conversationId: conversation.id,
      contactId: conversation.contactId,
      messageId: props.messageId,
      outcome: "workspace_inactive",
      workspaceId: conversation.workspaceId,
    })
    return
  }

  await distributedLock.runExclusive({
    key: `ai-action-handoff-reentry-${conversation.id}`,
    timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      const currentConversation = await conversationService.findBy({
        where: { id: conversation.id, workspaceId: conversation.workspaceId },
      })

      const messages = await createMessageRepository()
      const triggerMessage = await messages.findTriggerMessage({
        id: props.messageId,
        conversationId: conversation.id,
        workspaceId: conversation.workspaceId,
        sinceTime:
          getSafeSinceTime(
            contactInbox.lastMessageAt ?? contactInbox.createdAt,
            TRIGGER_MESSAGE_LOOKBACK_MS,
          ) ?? new Date(0),
        requireCompleteResults: true,
      })
      if (triggerMessage?.senderType !== "contact" || !triggerMessage.text) {
        await completeOutcome({
          conversationId: conversation.id,
          contactId: conversation.contactId,
          messageId: props.messageId,
          outcome: "invalid_trigger_message",
          workspaceId: conversation.workspaceId,
        })
        return
      }
      const triggerMessageText = triggerMessage.text

      const forwardTriggerMessage = async () => {
        await automatedResponseService.enqueue({
          conversationId: conversation.id,
          contactInboxId: contactInbox.id,
          messageId: props.messageId,
          messageText: triggerMessageText,
          workspaceId: conversation.workspaceId,
        })
      }

      if (!currentConversation || currentConversation.botEnabled) {
        await forwardTriggerMessage()
        await completeOutcome({
          conversationId: conversation.id,
          contactId: conversation.contactId,
          messageId: props.messageId,
          outcome: "already_enabled",
          workspaceId: conversation.workspaceId,
        })
        return
      }

      const aiAgent = await aiAgentService.findDefault(conversation.workspaceId)
      if (!aiAgent) {
        await completeOutcome({
          conversationId: conversation.id,
          contactId: conversation.contactId,
          messageId: props.messageId,
          outcome: "no_default_agent",
          workspaceId: conversation.workspaceId,
        })
        return
      }

      const parsedRules = aiAgentActionRulesSchema.safeParse(
        aiAgent.actionRules,
      )
      if (!parsedRules.success) {
        logger.warn(
          {
            err: normalizeError(parsedRules.error),
            agentId: aiAgent.id,
            conversationId: conversation.id,
            workspaceId: conversation.workspaceId,
          },
          "[ai-agent-actions] invalid handoff re-entry rules",
        )
      }
      const rules = parsedRules.success ? eligibleRules(parsedRules.data) : []
      if (rules.length === 0) {
        await completeOutcome({
          agentId: aiAgent.id,
          conversationId: conversation.id,
          contactId: conversation.contactId,
          messageId: props.messageId,
          outcome: "no_eligible_rule",
          workspaceId: conversation.workspaceId,
        })
        return
      }

      const providers = aiAgent.models as AIAgentProviderModels
      for (const providerInfo of providers) {
        const provider = getProviderName(providerInfo)
        const modelId = providerInfo.model
        const modelConfig = await createReplyModel({
          workspaceId: conversation.workspaceId,
          providerInfo,
        })
        if (!modelConfig) {
          continue
        }

        const selectionState: {
          current: HandoffReentrySelection | null
        } = { current: null }
        const selectionTool = createHandoffReentrySelectionTool({
          onSelection: (selected) => {
            selectionState.current = selected
          },
          rules,
        })

        try {
          const result = await streamText({
            model: modelConfig.model,
            system: buildHandoffReentryClassifierPrompt({
              actionPrompt: aiAgent.actionPrompt,
            }),
            messages: [{ role: "user", content: triggerMessageText }],
            maxOutputTokens: CLASSIFIER_MAX_OUTPUT_TOKENS,
            temperature: aiAgent.temperature,
            tools: { select_handoff_reentry_rule: selectionTool },
            toolChoice: {
              type: "tool",
              toolName: "select_handoff_reentry_rule",
            },
            stopWhen: stepCountIs(1),
            timeout: {
              totalMs: aiTimeouts.aiTotal,
              stepMs: aiTimeouts.aiStep,
              chunkMs: aiTimeouts.aiChunk,
            },
          })
          await result.text

          const selection = selectionState.current
          const selectedRule = selection
            ? rules.find((rule) => rule.id === selection.ruleId)
            : null
          const evidenceIsValid =
            selection &&
            hasValidHandoffReentryEvidence(
              triggerMessageText,
              selection.whenEvidence,
            ) &&
            hasValidHandoffReentryEvidence(
              triggerMessageText,
              selection.returnToBotEvidence,
            )
          if (!(selectedRule && evidenceIsValid)) {
            await completeOutcome({
              agentId: aiAgent.id,
              conversationId: conversation.id,
              contactId: conversation.contactId,
              messageId: props.messageId,
              modelId,
              outcome: "no_match",
              provider,
              reason: selection ? "invalid_evidence" : "no_selection",
              ruleCount: rules.length,
              workspaceId: conversation.workspaceId,
            })
            return
          }

          const actionTool = createAIAgentActionsTool({
            context: {
              channel: contactInbox.channel,
              contactId: conversation.contactId,
              contactInboxId: contactInbox.id,
              conversationId: conversation.id,
              ruleId: "",
              triggerMessageId: props.messageId,
              workspaceId: conversation.workspaceId,
            },
            executedRuleIds: new Set<string>(),
            rules: [selectedRule],
          })
          if (!actionTool.execute) {
            throw new Error("AI Action tool must be executable")
          }
          await actionTool.execute(
            { matches: [{ ruleId: selectedRule.id }] },
            {
              experimental_context: undefined,
              messages: [],
              toolCallId: props.messageId,
            },
          )

          const enabledConversation = await conversationService.findBy({
            where: {
              id: conversation.id,
              workspaceId: conversation.workspaceId,
            },
          })
          const outcome: HandoffReentryOutcome = enabledConversation?.botEnabled
            ? "executed"
            : "no_match"
          if (outcome === "executed") {
            await forwardTriggerMessage()
          }
          await completeOutcome({
            agentId: aiAgent.id,
            conversationId: conversation.id,
            contactId: conversation.contactId,
            messageId: props.messageId,
            modelId,
            outcome,
            provider,
            ruleCount: rules.length,
            workspaceId: conversation.workspaceId,
          })
          return
        } catch (err) {
          logger.warn(
            {
              err: normalizeError(err),
              agentId: aiAgent.id,
              conversationId: conversation.id,
              messageId: props.messageId,
              modelId,
              provider,
              workspaceId: conversation.workspaceId,
            },
            "[ai-agent-actions] handoff re-entry provider failed",
          )
        }
      }

      await completeOutcome({
        agentId: aiAgent.id,
        conversationId: conversation.id,
        contactId: conversation.contactId,
        messageId: props.messageId,
        outcome: "provider_unavailable",
        ruleCount: rules.length,
        workspaceId: conversation.workspaceId,
      })
    },
  })
}
