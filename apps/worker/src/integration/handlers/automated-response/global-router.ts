import { createHash } from "node:crypto"
import { aiTimeouts } from "@chatbotx.io/ai"
import {
  aiAgentService,
  conversationService,
  decisionEvaluationService,
  flowService,
  globalRouterService,
  inboxTeamService,
  isUserOnShift,
  logProviderErrorForChannel,
  workspaceMemberService,
} from "@chatbotx.io/business"
import type { DefaultReplyFrequency } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import { distributedLock, isLockAcquisitionError } from "@chatbotx.io/redis"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { handoffExecutorService } from "../../../trigger/services/handoff-executor.service"
import { runAgentReply } from "./run-agent-reply"

type RouterInput = {
  contactId: string
  contactInboxId: string
  conversationId: string
  messageCreatedAt?: Date
  messageId: string
  senderType?: string | null
  text?: string | null
  workspaceId: string
  contactInbox: ContactInboxModel
  conversation: ConversationModel
  defaultReplyFrequency: DefaultReplyFrequency
  workspace: WorkspaceModel
}

const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u
const hasTextContent = (text: string) => LETTER_OR_NUMBER.test(text)

type DispatchResult = {
  status: "retryableFailure" | "success" | "terminal" | "unavailable"
}
type UsableRouter = Extract<
  Awaited<ReturnType<typeof globalRouterService.findEnabledForWorkspace>>,
  { status: "usable" }
>

async function emitGlobalRouterAnalytics(input: {
  fallbackReason?:
    | "global_router_config_invalid"
    | "global_router_destination_failed"
    | "global_router_destination_unavailable"
    | "global_router_fallback_failed"
    | "global_router_no_route"
    | "global_router_provider_failed"
    | "global_router_threshold_unmet"
  hasResponse: boolean
  messageId: string
  result: "fallback" | "success"
  router: RouterInput
  startTime: number
}): Promise<void> {
  await emit("analytics:dashboard", {
    aiProvider: "none",
    conversationId: input.router.conversationId,
    eventType: "message:bot_received",
    hasResponse: input.hasResponse,
    messageId: input.messageId,
    metadata: {
      ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
      latency: Date.now() - input.startTime,
      triggerContext: {
        triggerHandler: "globalRouter",
        triggerSource: "worker",
        triggerType:
          input.result === "success"
            ? "bot_response_global_router_route"
            : "bot_response_global_router_failed",
      },
    },
    occurredAt: new Date(),
    responseType: "none",
    result: input.result,
    routeType: "fallback",
    workspaceId: input.router.workspaceId,
  })
}

export const isGlobalRouterEligibleMessage = (message: {
  senderType?: string | null
  text?: string | null
}) =>
  message.senderType === "contact" &&
  Boolean(message.text?.trim() && hasTextContent(message.text))

export const shouldRunGlobalRouterAfterAutomatedResponse = (status: {
  status: "handled" | "noEligibleMessage" | "noMatch"
}) => status.status !== "handled"

type GlobalRouterResult =
  | "absent"
  | "contention"
  | "invalid"
  | "noEligibleMessage"
  | "retryableFailure"
  | "success"
  | "terminal"
  | "unavailable"

/**
 * An unavailable destination has not produced a response, so the existing
 * default agent/reply path remains the safe fallback. Contention is different:
 * another worker owns this message's router evaluation.
 */
export const shouldStopAutomatedResponseAfterGlobalRouter = (
  status: GlobalRouterResult,
) => status === "success" || status === "terminal" || status === "contention"

async function dispatchDestination(input: {
  destination: UsableRouter["config"]["fallback"]
  enabled: UsableRouter
  mode: "fallback" | "primary"
  router: RouterInput
}): Promise<DispatchResult> {
  const { destination, enabled, mode, router } = input
  try {
    if (destination.type === "flow") {
      const flow = await flowService.findActiveById({
        id: destination.id,
        workspaceId: router.workspaceId,
      })
      if (!flow?.currentVersionId) {
        return { status: "unavailable" }
      }
      await integrationQueue.add(
        IntegrationJobAction.sendFlow,
        {
          type: IntegrationJobAction.sendFlow,
          data: {
            contactInboxId: router.contactInboxId,
            conversationId: router.conversationId,
            flowId: destination.id,
            origin: webhookChannelOrigin(),
            trackingContext: {
              aiProvider: "none",
              conversationId: router.conversationId,
              messageId: router.messageId,
              responseType: "flow",
              startTime: Date.now(),
              triggerType:
                mode === "primary"
                  ? "bot_response_global_router_route"
                  : "bot_response_global_router_fallback",
              workspaceId: router.workspaceId,
            },
            triggerMessageCreatedAt: router.messageCreatedAt,
            triggerMessageId: router.messageId,
            startedByContactMessage: true,
          },
        },
        {
          jobId: `global-router-flow-${router.contactInboxId}-${router.messageId}${mode === "fallback" ? "-fallback" : ""}`,
        },
      )
      return { status: "success" }
    }
    if (destination.type === "user" || destination.type === "team") {
      const available =
        destination.type === "user"
          ? await workspaceMemberService.findMembership({
              userId: destination.id,
              workspaceId: router.workspaceId,
            })
          : await inboxTeamService.exists({
              id: destination.id,
              workspaceId: router.workspaceId,
            })
      if (!available) {
        return { status: "unavailable" }
      }
      // Checked BEFORE the handoff: it is irreversible, so an off-shift user
      // must resolve to `unavailable` and take the route's fallback instead.
      if (
        destination.type === "user" &&
        !(await isUserOnShift({
          workspaceId: router.workspaceId,
          userId: destination.id,
        }))
      ) {
        return { status: "unavailable" }
      }
      const handoff = await handoffExecutorService.execute({
        channel: router.contactInbox.channel,
        contactId: router.contactId,
        conversationId: router.conversationId,
        metadata: { profileId: enabled.profile.id },
        reason: "global_router_route",
        reopenUnansweredHumanReplyWindow: true,
        source: "global_router",
        workspaceId: router.workspaceId,
      })
      if (handoff.status === "alreadyHandedOff") {
        return { status: "terminal" }
      }
      try {
        await conversationService.claimAssignmentIfUnassigned({
          assignedId: `${destination.type === "user" ? "u" : "t"}_${destination.id}`,
          conversation: { id: router.conversationId },
          triggerContext: {
            triggerHandler: "globalRouter",
            triggerSource: "worker",
            triggerType: "global_router",
          },
          workspaceId: router.workspaceId,
        })
      } catch (error) {
        // A successful handoff is irreversible.  Do not send a bot fallback
        // after it, even when the subsequent guarded assignment fails.
        logger.error(
          {
            err: normalizeError(error),
            conversationId: router.conversationId,
            messageId: router.messageId,
            profileId: enabled.profile.id,
            workspaceId: router.workspaceId,
          },
          "Global Router assignment failed after human handoff",
        )
      }
      return { status: "terminal" }
    }
    const agent = await aiAgentService.findByIdForWorkspace({
      id: destination.id,
      workspaceId: router.workspaceId,
    })
    if (!agent) {
      return { status: "unavailable" }
    }
    const result = await runAgentReply({
      aiAgent: agent,
      channel: router.contactInbox.channel,
      contactInbox: router.contactInbox,
      conversation: router.conversation,
      defaultReplyFlowId: null,
      defaultReplyFrequency: router.defaultReplyFrequency,
      fileOnlyTrigger: false,
      messages: [{ content: router.text?.trim() ?? "", role: "user" }],
      trackingTriggerType:
        mode === "primary"
          ? "bot_response_global_router_route"
          : "bot_response_global_router_fallback",
      triggerMessageCreatedAt: router.messageCreatedAt,
      triggerMessageId: router.messageId,
      workspaceTimezone: router.workspace.timezone ?? undefined,
    })
    return result?.responded
      ? { status: "success" }
      : { status: "retryableFailure" }
  } catch (error) {
    logger.error(
      {
        err: normalizeError(error),
        conversationId: router.conversationId,
        destinationType: destination.type,
        messageId: router.messageId,
        mode,
        profileId: enabled.profile.id,
        workspaceId: router.workspaceId,
      },
      "Global Router destination dispatch failed",
    )
    return { status: "retryableFailure" }
  }
}

export async function runGlobalRouter(
  input: RouterInput,
): Promise<GlobalRouterResult> {
  if (!isGlobalRouterEligibleMessage(input)) {
    return "noEligibleMessage"
  }
  const enabled = await globalRouterService.findEnabledForWorkspace(
    input.workspaceId,
  )
  if (enabled.status === "absent") {
    return "absent"
  }
  if (enabled.status === "invalid") {
    logger.error(
      {
        conversationId: input.conversationId,
        messageId: input.messageId,
        reason: enabled.reason,
        workspaceId: input.workspaceId,
      },
      "Global Router is configured but unavailable",
    )
    await logProviderErrorForChannel(input.contactInbox.channel, {
      contactId: input.contactId,
      error: new Error(enabled.reason),
      workspaceId: input.workspaceId,
    })
    await emitGlobalRouterAnalytics({
      fallbackReason: "global_router_config_invalid",
      hasResponse: false,
      messageId: input.messageId,
      result: "fallback",
      router: input,
      startTime: Date.now(),
    })
    return "invalid"
  }
  const lockKey = `global-router:${input.workspaceId}:${input.conversationId}:${input.messageId}`
  try {
    return await distributedLock.runExclusive({
      fn: async () => {
        const startTime = Date.now()
        const decisionExecutionKey = `global-router-${createHash("sha256").update(`${input.workspaceId}:${enabled.profile.id}:${input.messageId}`).digest("hex")}`
        try {
          const evaluation =
            await decisionEvaluationService.evaluateInboundMessage({
              connection: enabled.connection,
              decisionExecutionKey,
              profile: enabled.profile,
              text: input.text?.trim() ?? "",
              workspaceId: input.workspaceId,
            })
          if (evaluation.status === "contention") {
            return "contention" as const
          }
          let destination = enabled.config.fallback
          let mode: "fallback" | "primary" = "fallback"
          let fallbackReason:
            | "global_router_destination_failed"
            | "global_router_destination_unavailable"
            | "global_router_no_route"
            | "global_router_provider_failed"
            | "global_router_threshold_unmet"
            | undefined
          if (evaluation.status === "answer") {
            const resolved = globalRouterService.resolveRoute({
              answer: evaluation.answer,
              config: enabled.config,
              contract: enabled.profile.contract,
            })
            if (resolved.destination) {
              destination = resolved.destination
              mode = "primary"
            } else {
              fallbackReason =
                resolved.reason === "thresholdUnmet"
                  ? "global_router_threshold_unmet"
                  : "global_router_no_route"
            }
            const metadata = await globalRouterService.writeMetadata({
              answer: evaluation.answer,
              config: enabled.config,
              contactId: input.contactId,
              contactInboxId: input.contactInboxId,
              workspaceId: input.workspaceId,
            })
            if (metadata.status === "failed") {
              destination = enabled.config.fallback
              mode = "fallback"
              fallbackReason = "global_router_destination_failed"
            }
          } else if (evaluation.status === "thresholdUnmet") {
            fallbackReason = "global_router_threshold_unmet"
          } else {
            fallbackReason = "global_router_provider_failed"
            await logProviderErrorForChannel(input.contactInbox.channel, {
              contactId: input.contactId,
              error: new Error(evaluation.reason),
              workspaceId: input.workspaceId,
            })
          }
          const result = await dispatchDestination({
            destination,
            enabled,
            mode,
            router: input,
          })
          if (result.status === "success" || result.status === "terminal") {
            if (destination.type === "user" || destination.type === "team") {
              await emitGlobalRouterAnalytics({
                fallbackReason:
                  mode === "fallback" ? fallbackReason : undefined,
                hasResponse: false,
                messageId: input.messageId,
                result: mode === "primary" ? "success" : "fallback",
                router: input,
                startTime,
              })
            }
            return result.status
          }
          if (mode === "primary") {
            fallbackReason =
              result.status === "unavailable"
                ? "global_router_destination_unavailable"
                : "global_router_destination_failed"
            const fallbackResult = await dispatchDestination({
              destination: enabled.config.fallback,
              enabled,
              mode: "fallback",
              router: input,
            })
            if (
              (fallbackResult.status === "success" ||
                fallbackResult.status === "terminal") &&
              (enabled.config.fallback.type === "user" ||
                enabled.config.fallback.type === "team")
            ) {
              await emitGlobalRouterAnalytics({
                fallbackReason,
                hasResponse: false,
                messageId: input.messageId,
                result: "fallback",
                router: input,
                startTime,
              })
            } else if (
              fallbackResult.status !== "success" &&
              fallbackResult.status !== "terminal"
            ) {
              logger.error(
                {
                  conversationId: input.conversationId,
                  messageId: input.messageId,
                  profileId: enabled.profile.id,
                  workspaceId: input.workspaceId,
                },
                "Global Router fallback destination failed",
              )
              await emitGlobalRouterAnalytics({
                fallbackReason:
                  fallbackResult.status === "unavailable"
                    ? "global_router_destination_unavailable"
                    : "global_router_fallback_failed",
                hasResponse: false,
                messageId: input.messageId,
                result: "fallback",
                router: input,
                startTime,
              })
            }
            return fallbackResult.status
          }
          logger.error(
            {
              conversationId: input.conversationId,
              messageId: input.messageId,
              profileId: enabled.profile.id,
              workspaceId: input.workspaceId,
            },
            "Global Router fallback destination failed",
          )
          await emitGlobalRouterAnalytics({
            fallbackReason: "global_router_fallback_failed",
            hasResponse: false,
            messageId: input.messageId,
            result: "fallback",
            router: input,
            startTime,
          })
          // No destination was dispatched. Return unavailable so the parent
          // can safely use its existing default agent/reply fallback.
          return result.status
        } catch (error) {
          logger.error(
            {
              err: normalizeError(error),
              conversationId: input.conversationId,
              messageId: input.messageId,
              profileId: enabled.profile.id,
              workspaceId: input.workspaceId,
            },
            "Global Router evaluation failed; dispatching fallback",
          )
          await logProviderErrorForChannel(input.contactInbox.channel, {
            contactId: input.contactId,
            error,
            workspaceId: input.workspaceId,
          })
          const fallbackResult = await dispatchDestination({
            destination: enabled.config.fallback,
            enabled,
            mode: "fallback",
            router: input,
          })
          if (
            fallbackResult.status !== "success" &&
            fallbackResult.status !== "terminal"
          ) {
            await emitGlobalRouterAnalytics({
              fallbackReason: "global_router_fallback_failed",
              hasResponse: false,
              messageId: input.messageId,
              result: "fallback",
              router: input,
              startTime,
            })
          }
          return fallbackResult.status
        }
      },
      key: lockKey,
      retryTimeoutInSeconds: 0,
      timeoutInSeconds: Math.ceil((aiTimeouts.aiTotal + 15_000) / 1000),
    })
  } catch (error) {
    if (isLockAcquisitionError(error, lockKey)) {
      return "contention"
    }
    logger.error(
      {
        err: normalizeError(error),
        conversationId: input.conversationId,
        messageId: input.messageId,
        profileId: enabled.profile.id,
        workspaceId: input.workspaceId,
      },
      "Global Router dispatch failed",
    )
    await logProviderErrorForChannel(input.contactInbox.channel, {
      contactId: input.contactId,
      error,
      workspaceId: input.workspaceId,
    })
    await emitGlobalRouterAnalytics({
      fallbackReason: "global_router_fallback_failed",
      hasResponse: false,
      messageId: input.messageId,
      result: "fallback",
      router: input,
      startTime: Date.now(),
    })
    return "retryableFailure"
  }
}
