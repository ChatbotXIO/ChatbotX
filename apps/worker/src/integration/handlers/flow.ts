import { and, db, eq } from "@chatbotx.io/database/client"
import { contactInboxModel } from "@chatbotx.io/database/schema"
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
import { findConversationAndFlowVersion } from "../../lib/db"
import { logger } from "../../lib/logger"
import { flowStepHandlers } from "./step"

export type ExecuteMultipleStepsProps = {
  conversation: ConversationModel
  contactInbox?: ContactInboxModel
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

export const runFlowNode = async (props: IntegrationJobRunFlowNode) => {
  if (!props.data.flowId) {
    logger.debug({ props }, "runFlowNode is called without flowId")
    return
  }

  const { trackingContext, metadata } = props.data
  const { conversation, flowVersion, useLatestFlowVersion } =
    await findConversationAndFlowVersion({
      conversationId: props.data.conversationId,
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
    })

  // Process to find start node. Try to find by nodeId first, if not found, try to find by isStartNode.
  let targetNode: FlowNode | null | undefined = null
  if (props.data.nodeId) {
    targetNode = (flowVersion.nodes as unknown as FlowNode[]).find(
      (n) => n.id === props.data.nodeId,
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
              conversationId: props.conversation.id,
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
      type: "sendFlow",
      data: {
        conversationId: data.conversationId,
        flowId: parsedAction.flowId,
        flowVersionId: parsedAction.flowVersionId,
      },
    })
    return
  }

  const { conversation, flowVersion } = await findConversationAndFlowVersion({
    conversationId: data.conversationId,
    flowId: parsedAction.flowId,
    flowVersionId: parsedAction.flowVersionId,
  })

  const nodes = flowVersion.nodes as unknown as FlowNode[]

  const { button: foundedButton, nodeId: foundedNodeId } = getNodeFromButton(
    nodes,
    parsedAction.buttonId,
  )

  if (!foundedButton) {
    return
  }

  const [contactInbox] = await db
    .select({
      id: contactInboxModel.id,
      channel: contactInboxModel.channel,
    })
    .from(contactInboxModel)
    .where(eq(contactInboxModel.id, data.contactInboxId))

  if (data.webhookType !== IntegrationJobAction.messageStatus) {
    await emit(flowEventTypeSchema.enum["flow:clicked"], {
      nodeId: foundedNodeId ?? "",
      context: {
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        conversationId: data.conversationId,
        channel: contactInbox?.channel ?? "",
        contactInboxId: contactInbox?.id ?? "",
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

  await runStepsAndQuickReplies({
    conversation,
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
}

export async function runFlowQuickReply(
  data: IntegrationJobSendFlowQuickReply["data"],
) {
  const parsedAction = decodeButtonPayload(data.action)
  if (!parsedAction) {
    throw new SdkException("Invalid quick reply action")
  }

  const { conversation, flowVersion } = await findConversationAndFlowVersion({
    conversationId: data.conversationId,
    flowId: parsedAction.flowId,
    flowVersionId: parsedAction.flowVersionId,
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

  if (conversation.contactId) {
    let contactInbox: { id: string; channel: string } | undefined
    if (data.inboxId) {
      contactInbox = await db
        .select({
          id: contactInboxModel.id,
          channel: contactInboxModel.channel,
        })
        .from(contactInboxModel)
        .where(
          and(
            eq(contactInboxModel.contactId, conversation.contactId),
            eq(contactInboxModel.inboxId, data.inboxId),
          ),
        )
        .then((rows) => rows[0])

      if (data.webhookType !== IntegrationJobAction.messageStatus) {
        await emit(flowEventTypeSchema.enum["flow:clicked"], {
          nodeId: foundedNodeId ?? "",
          context: {
            workspaceId: conversation.workspaceId,
            contactId: conversation.contactId,
            conversationId: data.conversationId,
            channel: contactInbox?.channel ?? "",
            contactInboxId: contactInbox?.id ?? "",
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
    }
  }

  await runStepsAndQuickReplies({
    conversation,
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
}
