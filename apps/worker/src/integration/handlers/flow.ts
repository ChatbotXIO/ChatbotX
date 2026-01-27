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
import { SdkException } from "@aha.chat/sdk"
import type {
  IntegrationJobRunFlowNode,
  IntegrationJobSendFlowPostback,
  IntegrationJobSendFlowQuickReply,
} from "@aha.chat/worker-config"
import { findConversationAndFlowVersion } from "../../lib/db"
import { flowStepHandlers } from "./step"

export type ExecuteMultipleStepsProps = {
  conversation: ConversationModel
  flowVersion: FlowVersionModel
  useLatestFlowVersion: boolean
  targetType: "node" | "button" | "step" | "quickReply"
  targetId: string
  steps: BaseStepSchema[]
}

export type ExecuteStepProps<T, Y = unknown> = Omit<
  ExecuteMultipleStepsProps,
  "steps"
> & {
  step: T
  state?: Y
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
  targetType: "node" | "button" | "step" | "quickReply"
  targetId: string
  triggerNextNode?: boolean
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
  if (details.beforeStep) {
    await executeMultipleSteps({
      ...props,
      steps: [details.beforeStep],
    })
  }

  await new Promise((resolve) => setTimeout(resolve, 200))

  // run steps
  if ("steps" in details && details.steps) {
    await executeMultipleSteps({
      ...props,
      steps: details.steps,
    })
  }

  await new Promise((resolve) => setTimeout(resolve, 200))

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

  await new Promise((resolve) => setTimeout(resolve, 200))

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
  let result = await gen.next()

  while (!result.done) {
    result = await gen.next()
  }
}

async function* executeMultipleStepsGenerator(
  props: ExecuteMultipleStepsProps,
) {
  const { steps, ...rest } = props

  for (const step of steps) {
    const result = await flowStepHandlers[step.stepType as StepType]?.({
      ...rest,
      step,
    })

    if (result?.wait) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
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
        ? n.data.details.steps
        : [],
    )
    .flatMap((s) => ("buttons" in s ? s.buttons : []))
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
  })
}
