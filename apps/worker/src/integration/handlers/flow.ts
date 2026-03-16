import type {
  ConversationModel,
  FlowVersionModel,
} from "@aha.chat/database/types"
import {
  type BaseStepSchema,
  type ButtonStepProps,
  decodeButtonPayload,
  type EdgeSchema,
  type FlowNode,
  type SendQuickReplyStepSchema,
  StepType,
} from "@aha.chat/flow-config"
import { initVariables, SdkException, type Variables } from "@aha.chat/sdk"
import {
  IntegrationJobAction,
  type IntegrationJobRunFlowNode,
  type IntegrationJobSendFlowPostback,
  type IntegrationJobSendFlowQuickReply,
  integrationQueue,
} from "@aha.chat/worker-config"
import { findConversationAndFlowVersion } from "../../lib/db"
import { logger } from "../../lib/logger"
import { flowStepHandlers } from "./step"

export type ExecuteMultipleStepsProps = {
  conversation: ConversationModel
  flowVersion?: FlowVersionModel
  useLatestFlowVersion?: boolean
  targetType?: "node" | "button" | "step" | "quickReply"
  targetId?: string
  ctx?: {
    variables: Variables
  }
  steps: BaseStepSchema[]
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
  triggerNextNode?: boolean
  ctx: {
    variables: Variables
  }
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
    ctx: {
      variables: initVariables(),
    },
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
  if (details.beforeStep && !props.startFromStepIndex) {
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
          stepType: StepType.sendQuickReply,
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
    logger.debug({ step }, "executing step")
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

  const { conversation, flowVersion } = await findConversationAndFlowVersion({
    conversationId: data.conversationId,
    flowId: parsedAction.flowId,
    flowVersionId: parsedAction.flowVersionId,
  })

  const nodes = flowVersion.nodes as unknown as FlowNode[]

  const foundedButton = nodes
    .flatMap((n) =>
      "steps" in n.data.details && n.data.details.steps
        ? (n.data.details.steps as BaseStepSchema[])
        : [],
    )
    .flatMap((s) => ("buttons" in s ? (s.buttons as ButtonStepProps[]) : []))
    .find((b) => b.id === parsedAction.buttonId)

  if (!foundedButton) {
    return
  }

  await runStepsAndQuickReplies({
    conversation,
    flowVersion,
    useLatestFlowVersion: true,
    details: foundedButton,
    targetType: "button",
    targetId: foundedButton.id,
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

  const found = nodes
    .flatMap((n) =>
      "quickReplies" in n.data.details && n.data.details.quickReplies
        ? n.data.details.quickReplies
        : [],
    )
    .find((b) => b.id === parsedAction.buttonId)

  if (!found) {
    return
  }

  await runStepsAndQuickReplies({
    conversation,
    flowVersion,
    useLatestFlowVersion: true,
    details: found,
    targetType: "quickReply",
    targetId: found.id,
    ctx: {
      variables: initVariables(),
    },
  })
}
