import { conversationService } from "@chatbotx.io/business"
import { contactInboxService } from "@chatbotx.io/business/contact-inbox"
import { smartDelayService } from "@chatbotx.io/business/smart-delay"
import {
  type ConversationQuickReplyChallenge,
  smartDelayStatuses,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import {
  type ButtonStepProps,
  type FlowNode,
  type MetadataPayload,
  metadataSchema,
  type QuickReplyNextStep,
  resolveActiveQuickReplySettings,
  type SendTextStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { initVariables, SdkException } from "@chatbotx.io/sdk"
import {
  detectConversationAndContactInbox,
  detectFlowVersion,
} from "../../lib/db"
import { logger } from "../../lib/logger"
import { runStepsAndQuickReplies } from "./flow"
import { enqueueFlowStepMessage } from "./flow-utils"
import { requeueClaimedRunOrLog } from "./smart-delay"

type FlowVersion = Awaited<ReturnType<typeof detectFlowVersion>>["flowVersion"]

/** `undefined` when the flow version is gone (paused/unpublished/deleted). */
async function tryDetectFlowVersion(
  props: Parameters<typeof detectFlowVersion>[0],
  onUnavailable: (error: unknown) => Promise<void> | void,
): Promise<Awaited<ReturnType<typeof detectFlowVersion>> | undefined> {
  try {
    return await detectFlowVersion(props)
  } catch (error) {
    if (!(error instanceof SdkException)) {
      throw error
    }
    await onUnavailable(error)
    return
  }
}

const findNodeDetails = (flowVersion: FlowVersion, nodeId: string) =>
  (flowVersion.nodes as unknown as FlowNode[]).find(
    (node) => node.id === nodeId,
  )?.data.details

/**
 * Runs a settings target through the exact path a tapped quick reply takes,
 * so node jumps follow the section's edge and external targets run their
 * beforeStep.
 */
export async function routeQuickReplyTarget(props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  flowVersion: FlowVersion
  useLatestFlowVersion: boolean
  sourceNodeId: string
  section: { id: string; target: QuickReplyNextStep }
  metadata?: MetadataPayload
}): Promise<void> {
  const details = {
    id: props.section.id,
    label: "",
    ...props.section.target,
    steps: [],
  } as unknown as ButtonStepProps

  await runStepsAndQuickReplies({
    conversation: props.conversation,
    contactInbox: props.contactInbox,
    flowVersion: props.flowVersion,
    useLatestFlowVersion: props.useLatestFlowVersion,
    details,
    targetType: "quickReply",
    targetId: props.section.id,
    targetNodeId: props.sourceNodeId,
    ctx: { variables: initVariables() },
    metadata: props.metadata,
  })
}

export async function runQuickReplyChallenge(props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  challenge: ConversationQuickReplyChallenge
}): Promise<void> {
  const { conversation, contactInbox, challenge } = props
  const { workspaceId } = conversation
  const { nodeId } = challenge.data

  // Webchat enqueues this without the inactive-conversation filter webhook
  // routing applies, so a human takeover must not get bot retries.
  if (!(await conversationService.ensureActive(conversation))) {
    await conversationService.clearQuickReplyChallenge({
      workspaceId,
      conversationId: conversation.id,
      nodeId,
    })
    logger.info(
      { conversationId: conversation.id, nodeId },
      "runQuickReplyChallenge: bot inactive, cleared challenge",
    )
    return
  }

  const resolved = await tryDetectFlowVersion(
    {
      flowId: challenge.data.flowId,
      flowVersionId: challenge.data.flowVersionId,
      workspaceId,
    },
    async (error) => {
      // A stuck challenge would block keywords and AI for this contact forever.
      await conversationService.clearQuickReplyChallenge({
        workspaceId,
        conversationId: conversation.id,
        nodeId,
      })
      logger.warn(
        { err: error, conversationId: conversation.id, nodeId },
        "runQuickReplyChallenge: flow version unavailable, cleared challenge",
      )
    },
  )
  if (!resolved) {
    return
  }
  const { flowVersion, useLatestFlowVersion } = resolved

  const details = findNodeDetails(flowVersion, nodeId)
  const retry = resolveActiveQuickReplySettings(details).retry

  if (!(details && "quickReplies" in details && retry)) {
    await conversationService.clearQuickReplyChallenge({
      workspaceId,
      conversationId: conversation.id,
      nodeId,
    })
    logger.info(
      { conversationId: conversation.id, nodeId },
      "runQuickReplyChallenge: retry no longer configured, cleared",
    )
    return
  }

  const attempts = challenge.data.attempts
  if (attempts < retry.maxRetries) {
    // Compare-and-set: of two concurrent messages only one wins and sends.
    const claimed = await conversationService.setQuickReplyChallengeAttempts({
      workspaceId,
      conversationId: conversation.id,
      nodeId,
      fromAttempts: attempts,
      toAttempts: attempts + 1,
    })
    if (!claimed) {
      return
    }

    const retryStep = {
      id: retry.id,
      nodeId,
      stepType: stepTypes.enum.sendText,
      text: retry.message,
      buttons: [],
    } as unknown as SendTextStepSchema

    try {
      await enqueueFlowStepMessage({
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        flowId: flowVersion.flowId,
        flowVersionId: useLatestFlowVersion ? undefined : flowVersion.id,
        executedFlowVersionId: flowVersion.id,
        step: retryStep,
        quickReplies: details.quickReplies ?? undefined,
      })
    } catch (error) {
      // Only an enqueue failure (`chatQueue.add`) lands here: the
      // `waitForChatJobCompletion` inside `enqueueFlowStepMessage` is bounded
      // and non-throwing, so a channel-side send failure is invisible here and
      // still counts as an attempt. For an enqueue failure, give the attempt
      // back so the next message retries.
      logger.warn(
        { err: error, conversationId: conversation.id, nodeId },
        "runQuickReplyChallenge: failed to send retry message",
      )
      try {
        await conversationService.setQuickReplyChallengeAttempts({
          workspaceId,
          conversationId: conversation.id,
          nodeId,
          fromAttempts: attempts + 1,
          toAttempts: attempts,
        })
      } catch (rollbackError) {
        logger.warn(
          { err: rollbackError, conversationId: conversation.id, nodeId },
          "runQuickReplyChallenge: failed to roll back retry attempt",
        )
      }
    }
    return
  }

  // Scoped by `attempts` too: a stale job must not clear a challenge that was
  // re-armed (attempts reset to 0) after this job read its snapshot.
  const cleared = await conversationService.clearQuickReplyChallenge({
    workspaceId,
    conversationId: conversation.id,
    nodeId,
    attempts,
  })
  if (!cleared) {
    return
  }

  await routeQuickReplyTarget({
    conversation,
    contactInbox,
    flowVersion,
    useLatestFlowVersion,
    sourceNodeId: nodeId,
    section: retry,
  })
}

type QuickReplyFollowUpRow = NonNullable<
  Awaited<ReturnType<typeof smartDelayService.findById>>
> & { nodeId: string }

async function resumeQuickReplyFollowUp(
  row: QuickReplyFollowUpRow,
  conversation: ConversationModel,
  contactInbox: ContactInboxModel,
): Promise<void> {
  const resolved = await tryDetectFlowVersion(
    {
      flowId: row.flowId,
      flowVersionId: row.flowVersionId ?? undefined,
      workspaceId: row.workspaceId,
    },
    (error) => {
      logger.warn(
        { err: error, smartDelayId: row.id, nodeId: row.nodeId },
        "Quick reply follow-up skipped: flow version unavailable",
      )
    },
  )
  if (!resolved) {
    return
  }
  const { flowVersion, useLatestFlowVersion } = resolved

  const followUp = resolveActiveQuickReplySettings(
    findNodeDetails(flowVersion, row.nodeId),
  ).followUp
  if (!followUp) {
    logger.warn(
      { smartDelayId: row.id, nodeId: row.nodeId },
      "Quick reply follow-up skipped: follow-up no longer configured",
    )
    return
  }

  await conversationService.clearQuickReplyChallenge({
    workspaceId: row.workspaceId,
    conversationId: row.conversationId,
    nodeId: row.nodeId,
  })

  const metadata = metadataSchema.safeParse(row.metadata)
  await routeQuickReplyTarget({
    conversation,
    contactInbox,
    flowVersion,
    useLatestFlowVersion,
    sourceNodeId: row.nodeId,
    section: followUp,
    metadata: metadata.success ? metadata.data : undefined,
  })
}

export async function runQuickReplyFollowUpResume(data: {
  smartDelayId: string
}): Promise<void> {
  const row = await smartDelayService.findById({ id: data.smartDelayId })
  if (
    !row ||
    row.type !== smartDelayTypes.enum.quickReplyFollowUp ||
    row.status !== smartDelayStatuses.enum.scheduled ||
    !row.nodeId
  ) {
    return
  }
  if (row.triggerAt.getTime() > Date.now()) {
    return
  }

  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId: row.conversationId,
      contactInboxId: row.contactInboxId,
    })

  const [hasReplied, isActive] = await Promise.all([
    contactInboxService.hasIncomingMessageSince({
      workspaceId: row.workspaceId,
      contactInboxId: row.contactInboxId,
      since: row.createdAt,
    }),
    conversationService.ensureActive(conversation),
  ])

  if (hasReplied || !isActive) {
    const canceled = await smartDelayService.claimForRun({
      id: row.id,
      to: smartDelayStatuses.enum.canceled,
    })
    if (canceled) {
      logger.info(
        { smartDelayId: row.id, hasReplied, isActive },
        "Quick reply follow-up canceled: contact engaged or bot inactive",
      )
    }
    return
  }

  const completed = await smartDelayService.claimForRun({
    id: row.id,
    to: smartDelayStatuses.enum.completed,
  })
  if (!completed) {
    return
  }

  // claimForRun is the concurrency guard. Routing runs inline, so restore the
  // row before letting BullMQ retry, or a transient failure drops the follow-up.
  try {
    await resumeQuickReplyFollowUp(
      { ...row, nodeId: row.nodeId },
      conversation,
      contactInbox,
    )
  } catch (error) {
    await requeueClaimedRunOrLog(
      row.id,
      "Failed to requeue a claimed quick reply follow-up after failure",
    )
    throw error
  }
}
