import { and, db, eq } from "@chatbotx.io/database/client"
import { contactsOnBroadcastsModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
  FlowVersionModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import {
  type BaseStepSchema,
  BROADCAST_PAYLOAD_TYPE,
  type BroadcastMetadataPayload,
  type ButtonStepProps,
  decodeButtonPayload,
  type EdgeSchema,
  type FlowNode,
  flowEventTypeSchema,
  getNodeFromButton,
  type MetadataPayload,
  type SendQuickReplyStepSchema,
  type StepType,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { initVariables, SdkException, type Variables } from "@chatbotx.io/sdk"
import {
  type BotResponseTrackingContext,
  IntegrationJobAction,
  type IntegrationJobRunFlowNode,
  type IntegrationJobSendFlowPostback,
  type IntegrationJobSendFlowQuickReply,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import {
  detectConversationAndContactInbox,
  detectFlowVersion,
} from "../../lib/db"
import { logger } from "../../lib/logger"
import { type ExecuteMultipleStepsProps, seekConnectedNode } from "./flow-utils"
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
}

export const runFlowNode = async (props: IntegrationJobRunFlowNode["data"]) => {
  if (!props.flowId) {
    logger.debug({ props }, "runFlowNode is called without flowId")
    return
  }

  const { trackingContext, metadata, sendFrom } = props
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

  // Process to find start node. Try to find by nodeId first, if not found, try to find by isStartNode.
  let targetNode: FlowNode | null | undefined = null
  if (props.nodeId) {
    targetNode = (flowVersion.nodes as unknown as FlowNode[]).find(
      (n) => n.id === props.nodeId,
    )
  } else {
    targetNode = (flowVersion.nodes as unknown as FlowNode[]).find(
      (n) => n.data.isStartNode,
    )
  }
  if (!targetNode) {
    throw new SdkException("FlowVersion does not contain start node")
  }

  try {
    await runStepsAndQuickReplies({
      conversation,
      contactInbox,
      flowVersion,
      useLatestFlowVersion,
      details: targetNode.data.details,
      targetType: "node",
      targetId: targetNode.id,
      targetNodeId: targetNode.id,
      startFromStepId: props.startFromStepId,
      ctx: {
        variables: initVariables(),
      },
      trackingContext,
      metadata,
      sendFrom,
    })
  } catch (error) {
    if (props.metadata?.type === BROADCAST_PAYLOAD_TYPE) {
      const broadcastMeta = props.metadata as BroadcastMetadataPayload
      await db
        .update(contactsOnBroadcastsModel)
        .set({ failed: true, failedAt: new Date() })
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

  // run before step
  // Skip startAnotherNode beforeStep for buttons/quickReplies: the edge-following below
  // already navigates to the same target node, so running beforeStep would execute it twice.
  const skipBeforeStep =
    (targetType === "button" || targetType === "quickReply") &&
    details.beforeStep?.stepType === stepTypes.enum.startAnotherNode

  if (details.beforeStep && !props.startFromStepId && !skipBeforeStep) {
    await executeMultipleSteps({
      ...props,
      steps: [details.beforeStep],
    })
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
      steps: [currentStep],
    })

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
          startFromStepId: nextStep.id,
          metadata: props.metadata,
          trackingContext: props.trackingContext,
          sendFrom: props.sendFrom,
        },
      })
      return
    }
    // Last step — fall through to quickReplies + next-node dispatch
  }

  if (
    "quickReplies" in details &&
    details.quickReplies &&
    details.quickReplies.length > 0
  ) {
    await executeMultipleSteps({
      ...props,
      steps: [
        {
          stepType: stepTypes.enum.sendQuickReply,
          message: "Please select an option",
          buttons: details.quickReplies,
        } as SendQuickReplyStepSchema,
      ],
    })
  }

  if (!triggerNextNode) {
    return
  }

  // send next node if exists
  let relatedEdge: EdgeSchema | null | undefined = null
  if (
    targetType === "button" ||
    targetType === "node" ||
    targetType === "quickReply"
  ) {
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
        trackingContext: props.trackingContext,
        sendFrom: props.sendFrom,
      },
    })
  }
}

export async function executeMultipleSteps(props: ExecuteMultipleStepsProps) {
  const gen = executeMultipleStepsGenerator(props)
  let lastResult: (ExecuteStepResult & { branched: boolean }) | undefined

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
  const { steps, ...rest } = props

  for (const step of steps) {
    const stepWithNodeId = { ...step, nodeId: props.targetNodeId || "" }

    const rawResult = await flowStepHandlers[step.stepType as StepType]?.({
      ...rest,
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
              trackingContext: props.trackingContext,
              sendFrom: props.sendFrom,
            },
          })
          branched = true
        }
      }
    }

    yield { ...result, branched }
  }
}

export async function runFlowPostback(
  data: IntegrationJobSendFlowPostback["data"],
) {
  const parsedAction = decodeButtonPayload(data.action)
  if (!parsedAction) {
    throw new SdkException("Invalid postback action")
  }

  if (!parsedAction.buttonId) {
    await runFlowNode({
      conversationId: data.conversationId,
      contactInboxId: data.contactInboxId,
      flowId: parsedAction.flowId,
      flowVersionId: parsedAction.flowVersionId,
    })
    return
  }

  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId: data.conversationId,
      contactInboxId: data.contactInboxId,
    })
  const { flowVersion } = await detectFlowVersion({
    flowId: parsedAction.flowId,
    flowVersionId: parsedAction.flowVersionId,
    workspaceId: conversation.workspaceId,
  })

  const nodes = flowVersion.nodes as unknown as FlowNode[]

  const { button: foundedButton, nodeId: foundedNodeId } = getNodeFromButton(
    nodes,
    parsedAction.buttonId,
  )

  if (!foundedButton) {
    return
  }

  const waFlowResponse = data.payload?.waFlowResponse
  if (
    waFlowResponse &&
    typeof waFlowResponse === "object" &&
    parsedAction.buttonId
  ) {
    const whatsappFlowStep = findWhatsappFlowStepByButtonId(
      nodes,
      parsedAction.buttonId,
    )
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
      nodeId: foundedNodeId ?? "",
      context: {
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        channel: contactInbox.channel,
        contactInboxId: contactInbox.id,
      },
      action: {
        flowId: parsedAction.flowId,
        buttonId: parsedAction.buttonId,
        broadcastId: parsedAction.broadcastId,
        sequenceStepId: parsedAction.sequenceStepId ?? "",
        clickType: "button",
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
      details: foundedButton,
      targetType: "button",
      targetId: foundedButton.id,
      targetNodeId: foundedNodeId ?? "",
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
            triggerHandler: "runFlowPostback",
            triggerType: "contact_postback",
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
            triggerHandler: "runFlowPostback",
            triggerType: "contact_postback_failed",
          },
        },
      })
    }
    throw error
  }
}

export async function runFlowQuickReply(
  data: IntegrationJobSendFlowQuickReply["data"],
) {
  const parsedAction = decodeButtonPayload(data.action)
  if (!parsedAction) {
    throw new SdkException("Invalid quick reply action")
  }

  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId: data.conversationId,
      contactInboxId: data.contactInboxId,
    })
  const { flowVersion } = await detectFlowVersion({
    flowId: parsedAction.flowId,
    flowVersionId: parsedAction.flowVersionId,
    workspaceId: conversation.workspaceId,
  })

  const nodes = flowVersion.nodes as unknown as FlowNode[]

  let found: ButtonStepProps | null = null
  let foundedNodeId: string | null = null
  for (const node of nodes) {
    if (
      !("quickReplies" in node.data.details && node.data.details.quickReplies)
    ) {
      continue
    }
    const quickReply = node.data.details.quickReplies.find(
      (qr) => qr.id === parsedAction.buttonId,
    )
    if (quickReply) {
      found = quickReply
      foundedNodeId = node.id
      break
    }
  }

  if (!found) {
    return
  }

  if (data.webhookType !== IntegrationJobAction.messageStatus) {
    await emit(flowEventTypeSchema.enum["flow:clicked"], {
      nodeId: foundedNodeId ?? "",
      context: {
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        channel: contactInbox.channel,
        contactInboxId: contactInbox.id,
      },
      action: {
        flowId: parsedAction.flowId,
        buttonId: parsedAction.buttonId,
        broadcastId: parsedAction.broadcastId,
        sequenceStepId: parsedAction.sequenceStepId ?? "",
        clickType: "quick_reply",
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
      details: found,
      targetType: "quickReply",
      targetId: found.id,
      targetNodeId: foundedNodeId ?? "",
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
            triggerHandler: "runFlowQuickReply",
            triggerType: "contact_quick_reply",
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
            triggerHandler: "runFlowQuickReply",
            triggerType: "contact_quick_reply_failed",
          },
        },
      })
    }
    throw error
  }
}
