import { automatedResponseService } from "@chatbotx.io/automated-response"
import { and, db, eq } from "@chatbotx.io/database/client"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import { contactsOnBroadcastsModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
  FlowVersionModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import {
  type BaseStepSchema,
  BROADCAST_PAYLOAD_TYPE,
  type BroadcastMetadataPayload,
  type ButtonStepProps,
  decodeButtonPayload,
  type EdgeSchema,
  type FlowActionTargetType,
  type FlowNode,
  flowActionTargetTypes,
  flowEventTypeSchema,
  isQuickReplyCarrierStep,
  type MetadataPayload,
  resolveFlowActionTarget,
  type StepType,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  type CommentAnchor,
  initVariables,
  SdkException,
  type Variables,
} from "@chatbotx.io/sdk"
import {
  type BotResponseTrackingContext,
  IntegrationJobAction,
  type IntegrationJobRunFlowNode,
  type IntegrationJobSendFlowPostback,
  type IntegrationJobSendFlowQuickReply,
  integrationQueue,
  type NodeVisits,
} from "@chatbotx.io/worker-config"
import {
  detectConversationAndContactInbox,
  detectFlowVersion,
} from "../../lib/db"
import { logger } from "../../lib/logger"
import {
  type ExecuteMultipleStepsProps,
  MESSAGE_PRODUCING_STEP_TYPES,
  seekConnectedNode,
} from "./flow-utils"
import { executeRichActions } from "./rich-response/action-executor"
import { richButtonPayloadSchema } from "./rich-response/button-payload"
import {
  type ExecuteStepResult,
  flowStepHandlers,
  type StepRoutingStatus,
} from "./step"
import {
  applyWhatsappFlowResponseSideEffects,
  findWhatsappFlowStepByButtonId,
} from "./whatsapp-flow-response"

const ROUTING_STATUSES = new Set<StepRoutingStatus>([
  "success",
  "error",
  "skip",
])

function findQuickReplyCarrierStep(props: {
  channel: string | null | undefined
  steps: BaseStepSchema[]
}) {
  for (let index = props.steps.length - 1; index >= 0; index--) {
    const step = props.steps[index]
    if (step && isQuickReplyCarrierStep(props.channel, step)) {
      return step
    }
  }
}

/**
 * Max times a single node may execute within one uninterrupted run.
 * The counter rides sendFlow jobs and resets on user pauses.
 */
export const MAX_NODE_EXECUTIONS = 3

export type {
  ExecuteMultipleStepsProps,
  ExecuteStepProps,
  SuccessErrorStepSchema,
} from "./flow-utils"
export { seekConnectedNode, sendFlow } from "./flow-utils"

type ExecuteStepsAndQuickRepliesProps = {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  flowVersion: FlowVersionModel
  useLatestFlowVersion: boolean
  details: {
    beforeStep?: BaseStepSchema | null
    steps?: BaseStepSchema[] | null
    quickReplies?: ButtonStepProps[] | null
  }
  startFromStepId?: string
  targetType: "node" | "button" | "step" | "quickReply"
  targetId: string
  targetNodeId?: string
  triggerNextNode?: boolean
  ctx: {
    variables: Variables
  }
  trackingContext?: BotResponseTrackingContext
  metadata?: MetadataPayload
  sendFrom?: "inbox"
  nodeVisits?: NodeVisits
  triggerMessageId?: string
  triggerMessageCreatedAt?: Date
  commentAnchor?: CommentAnchor
  appointmentId?: string
}

/** A job carries either an entity ID or the already-loaded entity. */
type FlowJobEntityRef =
  | string
  | Pick<ConversationModel | ContactInboxModel, "id">

const getFlowJobEntityId = (value: FlowJobEntityRef): string =>
  typeof value === "string" ? value : value.id

const createFlowActionWarningContext = (data: {
  conversationId: FlowJobEntityRef
  contactInboxId: FlowJobEntityRef
  action: string
}) => ({
  conversationId: getFlowJobEntityId(data.conversationId),
  contactInboxId: getFlowJobEntityId(data.contactInboxId),
  action: data.action,
})

export const runFlowNode = async (props: IntegrationJobRunFlowNode["data"]) => {
  if (!props.flowId) {
    logger.debug({ props }, "runFlowNode is called without flowId")
    return
  }

  const { trackingContext, metadata, sendFrom, commentAnchor } = props
  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId: props.conversationId,
      contactInboxId: props.contactInboxId,
    })
  const { flowVersion, useLatestFlowVersion } = await detectFlowVersion({
    flowId: props.flowId,
    flowVersionId: props.flowVersionId,
    workspaceId: conversation.workspaceId,
  })

  const nodes = flowVersion.nodes as unknown as FlowNode[]

  // A re-dispatched job continuing a button/quickReply's own multi-step chain
  // (executeMultipleStepsGenerator's one-step-per-job loop) carries its target
  // explicitly. Resolving by nodeId alone would land on the containing node's
  // details instead of the button/quickReply's, and startFromStepId would
  // never match one of the node's own step ids.
  let details: ExecuteStepsAndQuickRepliesProps["details"]
  let targetType: ExecuteStepsAndQuickRepliesProps["targetType"]
  let targetId: string
  let targetNodeId: string

  if (
    props.targetType === flowActionTargetTypes.button ||
    props.targetType === flowActionTargetTypes.quickReply
  ) {
    const resolved = props.targetId
      ? resolveFlowActionTarget(nodes, props.targetId)
      : null
    if (!resolved) {
      throw new SdkException(
        "FlowVersion does not contain the button/quickReply target",
      )
    }
    details = resolved.details
    targetType = resolved.targetType
    targetId = resolved.details.id
    targetNodeId = resolved.nodeId ?? props.nodeId ?? ""
  } else {
    // Process to find start node. Try to find by nodeId first, if not found, try to find by isStartNode.
    const targetNode = props.nodeId
      ? nodes.find((n) => n.id === props.nodeId)
      : nodes.find((n) => n.data.isStartNode)
    if (!targetNode) {
      throw new SdkException("FlowVersion does not contain start node")
    }
    details = targetNode.data.details
    targetType = "node"
    targetId = targetNode.id
    targetNodeId = targetNode.id
  }

  try {
    await runStepsAndQuickReplies({
      conversation,
      contactInbox,
      flowVersion,
      useLatestFlowVersion,
      details,
      targetType,
      targetId,
      targetNodeId,
      startFromStepId: props.startFromStepId,
      ctx: {
        variables: initVariables(),
      },
      trackingContext,
      metadata,
      sendFrom,
      nodeVisits: props.nodeVisits,
      commentAnchor,
      appointmentId: props.appointmentId,
    })
  } catch (error) {
    if (props.metadata?.type === BROADCAST_PAYLOAD_TYPE) {
      const broadcastMeta = props.metadata as BroadcastMetadataPayload
      await db
        .update(contactsOnBroadcastsModel)
        .set({ failedAt: new Date() })
        .where(
          and(
            eq(
              contactsOnBroadcastsModel.broadcastId,
              broadcastMeta.broadcastId,
            ),
            eq(contactsOnBroadcastsModel.contactId, conversation.contactId),
          ),
        )
        .catch((dbErr) =>
          logger.error(
            { err: dbErr },
            "Failed to mark broadcast contact as failed",
          ),
        )
    }
    throw error
  }
}

export async function runStepsAndQuickReplies(
  props: ExecuteStepsAndQuickRepliesProps,
) {
  const {
    details,
    targetType,
    targetId,
    flowVersion,
    triggerNextNode = true,
  } = props
  const quickReplies =
    "quickReplies" in details && details.quickReplies
      ? details.quickReplies
      : []
  const quickReplyCarrier = details.steps
    ? findQuickReplyCarrierStep({
        channel: props.contactInbox.channel,
        steps: details.steps,
      })
    : undefined

  if (quickReplies.length > 0 && !quickReplyCarrier && !props.startFromStepId) {
    logger.warn(
      {
        flowId: flowVersion.flowId,
        flowVersionId: flowVersion.id,
        conversationId: props.conversation.id,
        contactInboxId: props.contactInbox.id,
        channel: props.contactInbox.channel,
        targetNodeId: props.targetNodeId,
      },
      "Flow node has quick replies but no attachable carrier step for this channel; skipping quick replies",
    )
  }

  // Loop guard: cap how many times a single node runs within one uninterrupted pass.
  // Only a real node entry is counted (no startFromStepId — mid-node re-dispatches reuse
  // the same count). The counter rides the job payload and resets when the flow pauses for
  // the user (wait / getUserData resume from a fresh payload), so only instant cycles add up.
  let nodeVisits = props.nodeVisits
  if (!props.startFromStepId && props.targetNodeId) {
    const count = (props.nodeVisits?.[props.targetNodeId] ?? 0) + 1
    // This node has already run MAX_NODE_EXECUTIONS times in this pass — the flow is cyclic
    // (e.g. node A → node B → node A). Stop here instead of sending forever, and log the
    // cycle (the nodeVisits map) so the misconfigured flow can be found.
    if (count > MAX_NODE_EXECUTIONS) {
      logger.warn(
        {
          nodeId: props.targetNodeId,
          count,
          maxNodeExecutions: MAX_NODE_EXECUTIONS,
          flowId: flowVersion.flowId,
          flowVersionId: flowVersion.id,
          conversationId: props.conversation.id,
          contactInboxId: props.contactInbox.id,
          nodeVisits: props.nodeVisits,
        },
        "Flow node exceeded max executions in one run; stopping to prevent an infinite loop",
      )
      return
    }
    nodeVisits = { ...props.nodeVisits, [props.targetNodeId]: count }
  }

  // run before step
  // Skip startAnotherNode beforeStep for buttons/quickReplies: the edge-following below
  // already navigates to the same target node, so running beforeStep would execute it twice.
  const skipBeforeStep =
    (targetType === "button" || targetType === "quickReply") &&
    details.beforeStep?.stepType === stepTypes.enum.startAnotherNode

  // Tracks whether the comment-anchored private-reply send is still available
  // to be claimed by the first message-producing step. Forwarded across every
  // re-enqueued sendFlow job below until a step consumes it (see
  // `executeMultipleStepsGenerator`'s `MESSAGE_PRODUCING_STEP_TYPES` check).
  let remainingAnchor = props.commentAnchor

  if (details.beforeStep && !props.startFromStepId && !skipBeforeStep) {
    const beforeResult = await executeMultipleSteps({
      ...props,
      nodeVisits,
      commentAnchor: remainingAnchor,
      steps: [details.beforeStep],
    })
    remainingAnchor = beforeResult?.commentAnchor
  }

  // run steps — one per BullMQ job, re-dispatching for subsequent steps
  if ("steps" in details && details.steps && details.steps.length > 0) {
    const startIdx = props.startFromStepId
      ? details.steps.findIndex((s) => s.id === props.startFromStepId)
      : 0

    if (startIdx === -1) {
      logger.warn(
        {
          startFromStepId: props.startFromStepId,
          targetNodeId: props.targetNodeId,
        },
        "startFromStepId not found in node steps",
      )
      return
    }

    const currentStep = details.steps[startIdx]
    const result = await executeMultipleSteps({
      ...props,
      nodeVisits,
      commentAnchor: remainingAnchor,
      quickReplies:
        quickReplyCarrier?.id === currentStep.id ? quickReplies : undefined,
      steps: [currentStep],
    })
    remainingAnchor = result?.commentAnchor

    if (result?.status === "wait" || result?.status === "retry") {
      return result
    }

    if (result?.branched) {
      return
    }

    const nextIdx = startIdx + 1
    if (nextIdx < details.steps.length) {
      const nextStep = details.steps[nextIdx]
      await integrationQueue.add(IntegrationJobAction.sendFlow, {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId: props.conversation.id,
          contactInboxId: props.contactInbox.id,
          flowId: flowVersion.flowId,
          flowVersionId: props.useLatestFlowVersion
            ? undefined
            : flowVersion.id,
          nodeId: props.targetNodeId,
          targetType:
            targetType === "button" || targetType === "quickReply"
              ? targetType
              : undefined,
          targetId:
            targetType === "button" || targetType === "quickReply"
              ? targetId
              : undefined,
          startFromStepId: nextStep.id,
          metadata: props.metadata,
          appointmentId: props.appointmentId,
          trackingContext: props.trackingContext,
          sendFrom: props.sendFrom,
          nodeVisits,
          commentAnchor: remainingAnchor,
          origin: webhookChannelOrigin(),
        },
      })
      return
    }
    // Last step — fall through to quickReplies + next-node dispatch
  }

  if (!triggerNextNode) {
    return
  }

  // send next node if exists
  //
  // A tapped button/quickReply resolves its next node through its edge only
  // when its own action is a node jump — or when it has no action at all
  // (`buttonType: null`, `whatsappOptionList`), where the edge is the only
  // routing it has. The canvas keeps type and edge in lockstep: dragging an
  // edge from a button handle rewrites that button to `startAnotherNode`, and
  // deleting the edge clears it back to `null` (`updateButtonRoute` /
  // `createRouteFields` in `flow-config/src/routable-handle.ts`). So a button
  // carrying an `openWebsite` / `startExternalFlow` / `startExternalNode`
  // action can never have been wired to a node on purpose — such an edge is
  // always left over from a config this button has since moved away from, and
  // following it would fire a node the button no longer targets on top of the
  // action it actually has.
  //
  // `targetType === "step"` keeps never following an edge, as before.
  const followsEdgeToNextNode =
    targetType === "node" ||
    ((targetType === "button" || targetType === "quickReply") &&
      (details.beforeStep == null ||
        details.beforeStep.stepType === stepTypes.enum.startAnotherNode))

  let relatedEdge: EdgeSchema | null | undefined = null
  if (followsEdgeToNextNode) {
    relatedEdge = (flowVersion.edges as EdgeSchema[]).find(
      (edge) => edge.sourceHandle === targetId,
    )
  }
  if (!relatedEdge?.target) {
    return
  }

  const nextNode = (flowVersion.nodes as unknown as FlowNode[]).find(
    (node) => node.id === relatedEdge.target,
  )
  if (nextNode) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: props.conversation.id,
        contactInboxId: props.contactInbox.id,
        flowId: flowVersion.flowId,
        flowVersionId: props.useLatestFlowVersion ? undefined : flowVersion.id,
        nodeId: nextNode.id,
        metadata: props.metadata,
        appointmentId: props.appointmentId,
        trackingContext: props.trackingContext,
        sendFrom: props.sendFrom,
        nodeVisits,
        commentAnchor: remainingAnchor,
        origin: webhookChannelOrigin(),
      },
    })
  }
}

export async function executeMultipleSteps(props: ExecuteMultipleStepsProps) {
  const gen = executeMultipleStepsGenerator(props)
  let lastResult:
    | (ExecuteStepResult & {
        branched: boolean
        commentAnchor?: CommentAnchor
      })
    | undefined

  for await (const result of gen) {
    logger.debug({ result }, "execute multiple steps result")
    if (result?.status === "wait" || result?.status === "retry") {
      return result
    }
    lastResult = result
  }
  return lastResult
}

async function* executeMultipleStepsGenerator(
  props: ExecuteMultipleStepsProps,
) {
  const { steps, commentAnchor, ...rest } = props
  // Consumed by the first message-producing step in this run (however many
  // jobs/nodes it takes to reach one) — see MESSAGE_PRODUCING_STEP_TYPES.
  let anchorAvailable = commentAnchor

  for (const step of steps) {
    // `nodeId` is overloaded: startAnotherNode/startExternalNode store their own jump
    // target in it, while every other step uses it only to tag the message with the node
    // that produced it (flow analytics). Keep the step's own target when present; otherwise
    // stamp the containing node id. Falling straight to `props.targetNodeId` here would make
    // a jump step target its own node and loop forever.
    const stepWithNodeId = {
      ...step,
      nodeId: step.nodeId ?? props.targetNodeId ?? "",
    }

    const isMessageProducingStep = MESSAGE_PRODUCING_STEP_TYPES.has(
      step.stepType as StepType,
    )
    const stepAnchor = isMessageProducingStep ? anchorAvailable : undefined
    if (isMessageProducingStep) {
      anchorAvailable = undefined
    }

    const rawResult = await flowStepHandlers[step.stepType as StepType]?.({
      ...rest,
      commentAnchor: stepAnchor,
      step: stepWithNodeId,
    })

    // void handlers are treated as implicit success (fire-and-forget, no routing)
    const result = rawResult ?? { status: "success" as const, result: null }

    // Route to a connected node based on the step's outcome state
    let branched = false
    if (
      ROUTING_STATUSES.has(result.status as StepRoutingStatus) &&
      stepWithNodeId.states &&
      stepWithNodeId.states.length > 0
    ) {
      const targetState = stepWithNodeId.states.find(
        (s) => s.stateType === result.status,
      )
      if (targetState) {
        const connectedNodeId = seekConnectedNode(
          props.flowVersion,
          targetState.id,
        )
        if (connectedNodeId) {
          await integrationQueue.add(IntegrationJobAction.sendFlow, {
            type: IntegrationJobAction.sendFlow,
            data: {
              conversationId: props.conversation.id,
              contactInboxId: props.contactInbox.id,
              flowId: props.flowVersion.flowId,
              flowVersionId: props.useLatestFlowVersion
                ? undefined
                : props.flowVersion.id,
              nodeId: connectedNodeId,
              metadata: props.metadata,
              appointmentId: props.appointmentId,
              trackingContext: props.trackingContext,
              sendFrom: props.sendFrom,
              nodeVisits: props.nodeVisits,
              commentAnchor: anchorAvailable,
              origin: webhookChannelOrigin(),
            },
          })
          branched = true
        }
      }
    }

    yield { ...result, branched, commentAnchor: anchorAvailable }
  }
}

async function tryRunRichButtonFallback(props: {
  buttonId: string
  contactInbox: ContactInboxModel
  conversation: ConversationModel
  flowContextId: string
  messageId?: string
}): Promise<
  | { handled: false }
  | { handled: true; shouldEnqueueAutomatedResponse: boolean }
> {
  const { buttonId, contactInbox, conversation, flowContextId, messageId } =
    props
  if (!messageId) {
    logger.warn(
      {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactId: conversation.contactId,
        buttonId,
        reason: "missing_message_id",
      },
      "[rich-response] cannot resolve rich button payload",
    )
  }

  const messageRepository = await createMessageRepository()
  const richResponse = await messageRepository.findRichResponseByButton({
    buttonId,
    contactInboxId: contactInbox.id,
    conversationId: conversation.id,
    messageId,
    workspaceId: conversation.workspaceId,
  })

  if (!richResponse) {
    return { handled: false }
  }

  const entry = richResponse.buttonPayloads[buttonId]
  if (!entry || entry.executionId !== richResponse.executionId) {
    logger.warn(
      {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactId: conversation.contactId,
        buttonId,
        executionId: richResponse.executionId,
        reason: "rich_button_payload_not_found",
      },
      "[rich-response] rich button payload not found",
    )
    return { handled: false }
  }

  const parsedPayload = richButtonPayloadSchema.safeParse(entry.payload)
  if (!parsedPayload.success || parsedPayload.data.type === "unsupported") {
    logger.warn(
      {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactId: conversation.contactId,
        buttonId,
        executionId: richResponse.executionId,
        reason:
          parsedPayload.success && parsedPayload.data.type === "unsupported"
            ? parsedPayload.data.reason
            : "invalid_rich_button_payload",
      },
      "[rich-response] unsupported rich button payload",
    )
    return { handled: true, shouldEnqueueAutomatedResponse: false }
  }

  if (parsedPayload.data.type === "text") {
    return { handled: true, shouldEnqueueAutomatedResponse: true }
  }

  await executeRichActions(
    parsedPayload.data.type === "send_flow"
      ? [{ action: "send_flow", flow_id: parsedPayload.data.flowId }]
      : parsedPayload.data.actions,
    {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      contactId: conversation.contactId,
      contactInboxId: contactInbox.id,
      inboxId: contactInbox.inboxId,
      channel: contactInbox.channel,
      executionId: richResponse.executionId,
      flowContextId,
    },
  )
  return { handled: true, shouldEnqueueAutomatedResponse: false }
}

/**
 * A tapped reply is dispatched to one of two jobs depending on how the channel
 * reported it, but from there the work is identical — only the wording of the
 * logs and analytics differs.
 */
const flowActionHandlers = {
  postback: {
    name: "runFlowPostback",
    triggerType: "contact_postback",
    failedTriggerType: "contact_postback_failed",
  },
  quickReply: {
    name: "runFlowQuickReply",
    triggerType: "contact_quick_reply",
    failedTriggerType: "contact_quick_reply_failed",
  },
} as const

type FlowActionHandler =
  (typeof flowActionHandlers)[keyof typeof flowActionHandlers]

/** `flow:clicked` reports the reply that was tapped, not the job that ran. */
const flowActionClickTypes = {
  [flowActionTargetTypes.button]: "button",
  [flowActionTargetTypes.quickReply]: "quick_reply",
} as const satisfies Record<FlowActionTargetType, string>

async function runFlowAction(
  data: IntegrationJobSendFlowPostback["data"],
  handler: FlowActionHandler,
) {
  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId: data.conversationId,
      contactInboxId: data.contactInboxId,
    })

  // Bare flow IDs (Messenger ad payloads) are only honored for Messenger
  // conversations. The channel is read from the persisted contactInbox, not
  // from the enqueuer, so no other channel (e.g. webchat) can trigger an
  // arbitrary flow by posting a bare numeric ID.
  const parsedAction = decodeButtonPayload(data.action, {
    allowBareFlowId: contactInbox.channel === "messenger",
  })
  if (!parsedAction) {
    logger.warn(
      createFlowActionWarningContext(data),
      `${handler.name}: could not decode action payload, skipping`,
    )
    return
  }

  const { buttonId } = parsedAction
  if (!buttonId) {
    // A bare flow-ID payload (Messenger ad) can point at a since-deleted or
    // unpublished flow. Resolve it first so a missing flow is a graceful skip
    // rather than a thrown job that retries and dead-letters to no effect.
    try {
      await detectFlowVersion({
        flowId: parsedAction.flowId,
        flowVersionId: parsedAction.flowVersionId,
        workspaceId: conversation.workspaceId,
      })
    } catch (error) {
      if (error instanceof SdkException) {
        logger.warn(
          createFlowActionWarningContext(data),
          `${handler.name}: bare flow ID could not be resolved, skipping`,
        )
        return
      }
      throw error
    }
    await runFlowNode({
      conversationId: data.conversationId,
      contactInboxId: data.contactInboxId,
      flowId: parsedAction.flowId,
      flowVersionId: parsedAction.flowVersionId,
    })
    return
  }

  const richButtonResult = await tryRunRichButtonFallback({
    buttonId,
    contactInbox,
    conversation,
    flowContextId: parsedAction.flowId,
    messageId: data.messageId,
  })
  if (richButtonResult.handled) {
    if (richButtonResult.shouldEnqueueAutomatedResponse && data.messageId) {
      await automatedResponseService.enqueue({
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        messageId: data.messageId,
        workspaceId: conversation.workspaceId,
      })
    }
    return
  }

  // A payload pins a version only when the run that sent it was pinned, so most
  // taps resolve the flow's *published* version — which a paused, unpublished or
  // deleted flow no longer has. Skip those the way the bare-flow-ID branch above
  // does: a thrown job would only retry and dead-letter, and the tap is already
  // in the past. Anything that is not a resolution failure still propagates so
  // the job can retry.
  let flowVersion: FlowVersionModel
  try {
    const resolved = await detectFlowVersion({
      flowId: parsedAction.flowId,
      flowVersionId: parsedAction.flowVersionId,
      workspaceId: conversation.workspaceId,
    })
    flowVersion = resolved.flowVersion
  } catch (error) {
    if (error instanceof SdkException) {
      logger.warn(
        {
          ...createFlowActionWarningContext(data),
          buttonId,
          flowId: parsedAction.flowId,
          flowVersionId: parsedAction.flowVersionId,
        },
        `${handler.name}: flow version could not be resolved, skipping`,
      )
      return
    }
    throw error
  }

  const nodes = flowVersion.nodes as unknown as FlowNode[]

  // The channel cannot say whether the tap was a step button or a node quick
  // reply, so the flow decides — and drives the target type from here on.
  const target = resolveFlowActionTarget(nodes, buttonId)
  if (!target) {
    logger.warn(
      {
        ...createFlowActionWarningContext(data),
        buttonId,
        flowId: parsedAction.flowId,
        flowVersionId: flowVersion.id,
      },
      `${handler.name}: action matches no button or quick reply, skipping`,
    )
    return
  }

  const targetNodeId = target.nodeId ?? ""

  const waFlowResponse = data.payload?.waFlowResponse
  if (waFlowResponse && typeof waFlowResponse === "object") {
    const whatsappFlowStep = findWhatsappFlowStepByButtonId(nodes, buttonId)
    if (whatsappFlowStep) {
      await applyWhatsappFlowResponseSideEffects({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        contactInbox,
        step: whatsappFlowStep,
        flowResponse: waFlowResponse,
      })
    }
  }

  if (data.webhookType !== IntegrationJobAction.messageStatus) {
    await emit(flowEventTypeSchema.enum["flow:clicked"], {
      nodeId: targetNodeId,
      context: {
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        channel: contactInbox.channel,
        contactInboxId: contactInbox.id,
      },
      action: {
        flowId: parsedAction.flowId,
        buttonId,
        broadcastId: parsedAction.broadcastId,
        sequenceStepId: parsedAction.sequenceStepId ?? "",
        clickType: flowActionClickTypes[target.targetType],
      },
      occurredAt: new Date(),
    })
  }

  const startTime = Date.now()
  try {
    await runStepsAndQuickReplies({
      conversation,
      contactInbox,
      flowVersion,
      useLatestFlowVersion: true,
      details: target.details,
      targetType: target.targetType,
      targetId: target.details.id,
      targetNodeId,
      ctx: {
        variables: initVariables(),
      },
    })
    if (data.messageId) {
      emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        messageId: data.messageId,
        occurredAt: new Date(),
        hasResponse: true,
        responseType: "flow",
        routeType: "flow",
        result: "success",
        aiProvider: "none",
        metadata: {
          latency: Date.now() - startTime,
          flowId: parsedAction.flowId,
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: handler.name,
            triggerType: handler.triggerType,
          },
        },
      })
    }
  } catch (error) {
    if (data.messageId) {
      emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        messageId: data.messageId,
        occurredAt: new Date(),
        hasResponse: false,
        responseType: "flow",
        routeType: "flow",
        result: "fallback",
        aiProvider: "none",
        metadata: {
          latency: Date.now() - startTime,
          flowId: parsedAction.flowId,
          fallbackReason: "handler_error_to_fallback",
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: handler.name,
            triggerType: handler.failedTriggerType,
          },
        },
      })
    }
    throw error
  }
}

export function runFlowPostback(data: IntegrationJobSendFlowPostback["data"]) {
  return runFlowAction(data, flowActionHandlers.postback)
}

export function runFlowQuickReply(
  data: IntegrationJobSendFlowQuickReply["data"],
) {
  return runFlowAction(data, flowActionHandlers.quickReply)
}
