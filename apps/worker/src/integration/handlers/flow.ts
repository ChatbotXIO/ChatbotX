import type {
  ContactInboxModel,
  ConversationModel,
  FlowVersionModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import {
  type BaseStepSchema,
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
import { flowStepHandlers } from "./step"

export type ExecuteMultipleStepsProps = {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  flowVersion: FlowVersionModel
  useLatestFlowVersion?: boolean
  targetType?: "node" | "button" | "step" | "quickReply"
  targetId?: string
  targetNodeId?: string
  ctx?: {
    variables: Variables
  }
  steps: BaseStepSchema[]
  trackingContext?: BotResponseTrackingContext
  metadata?: MetadataPayload
}

export type ExecuteStepProps<T> = Omit<ExecuteMultipleStepsProps, "steps"> & {
  step: T
}

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
  startFromStepIndex?: number
  targetType: "node" | "button" | "step" | "quickReply"
  targetId: string
  targetNodeId?: string
  triggerNextNode?: boolean
  ctx: {
    variables: Variables
  }
  trackingContext?: BotResponseTrackingContext
  metadata?: MetadataPayload
}

export const seekConnectedNode = (
  flowVersion: FlowVersionModel,
  sourceId: string,
) => {
  const connectedNode = (flowVersion.edges as EdgeSchema[]).find(
    (edge) => edge.sourceHandle === sourceId,
  )
  return connectedNode?.target
}

export type SuccessErrorStepSchema = BaseStepSchema & {
  successNodeId?: string
  errorNodeId?: string
}

export async function sendFlow(
  props: ExecuteStepProps<SuccessErrorStepSchema>,
  isSuccess: boolean,
) {
  const { conversation, contactInbox, flowVersion, step } = props
  if (!flowVersion) {
    return
  }

  const nodeId: string | undefined = isSuccess
    ? step.successNodeId
    : step.errorNodeId

  if (!nodeId) {
    return
  }

  const connectedNodeId = seekConnectedNode(flowVersion, nodeId)

  if (connectedNodeId) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: flowVersion.flowId,
        nodeId: connectedNodeId,
        metadata: props.metadata,
      },
    })
  }
}

export const runFlowNode = async (props: IntegrationJobRunFlowNode["data"]) => {
  if (!props.flowId) {
    logger.debug({ props }, "runFlowNode is called without flowId")
    return
  }

  const { trackingContext, metadata } = props
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

  await runStepsAndQuickReplies({
    conversation,
    contactInbox,
    flowVersion,
    useLatestFlowVersion,
    details: targetNode.data.details,
    targetType: "node",
    targetId: targetNode.id,
    targetNodeId: targetNode.id,
    ctx: {
      variables: initVariables(),
    },
    trackingContext,
    metadata,
  })
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

  if (details.beforeStep && !props.startFromStepIndex && !skipBeforeStep) {
    await executeMultipleSteps({
      ...props,
      steps: [details.beforeStep],
    })
  }

  // run steps
  if ("steps" in details && details.steps) {
    const result = await executeMultipleSteps({
      ...props,
      steps: props.startFromStepIndex
        ? details.steps.slice(props.startFromStepIndex)
        : details.steps,
    })

    if (result?.status === "wait" || result?.status === "retry") {
      return result
    }
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
    await runStepsAndQuickReplies({
      ...props,
      details: nextNode.data.details,
      targetType: "node",
      targetId: nextNode.id,
      targetNodeId: nextNode.id,
    })
  }
}

export async function executeMultipleSteps(props: ExecuteMultipleStepsProps) {
  const gen = executeMultipleStepsGenerator(props)

  for await (const result of gen) {
    logger.debug({ result }, "execute multiple steps result")
    if (result?.status === "wait" || result?.status === "retry") {
      return result
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

async function* executeMultipleStepsGenerator(
  props: ExecuteMultipleStepsProps,
) {
  const { steps, ...rest } = props

  for (const step of steps) {
    step.nodeId = props.targetNodeId || ""

    const result = await flowStepHandlers[step.stepType as StepType]?.({
      ...rest,
      step,
    })

    // Try to send nested step based on state of action
    const resultStatus = result?.status || ""
    if (
      resultStatus &&
      ["success", "skip", "error"].includes(resultStatus) &&
      step.states &&
      step.states.length > 0
    ) {
      const targetState = step.states.find((s) => s.stateType === resultStatus)
      if (targetState) {
        // Find connected node
        const connectedNodeId = seekConnectedNode(
          props.flowVersion,
          targetState.id,
        )
        if (connectedNodeId) {
          await integrationQueue.add(IntegrationJobAction.sendFlow, {
            type: IntegrationJobAction.sendFlow,
            data: {
              conversationId: props.conversation,
              contactInboxId: props.contactInbox,
              flowId: props.flowVersion.flowId,
              flowVersionId: props.flowVersion.id,
              nodeId: connectedNodeId,
              metadata: props.metadata,
            },
          })
        }
      }
    }

    yield result
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
      }).catch((err) =>
        logger.error(err, "[runFlowPostback] Failed to emit bot_received"),
      )
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
      }).catch((err) =>
        logger.error(
          err,
          "[runFlowPostback] Failed to emit bot_received fallback",
        ),
      )
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
      }).catch((err) =>
        logger.error(err, "[runFlowQuickReply] Failed to emit bot_received"),
      )
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
      }).catch((err) =>
        logger.error(
          err,
          "[runFlowQuickReply] Failed to emit bot_received fallback",
        ),
      )
    }
    throw error
  }
}
