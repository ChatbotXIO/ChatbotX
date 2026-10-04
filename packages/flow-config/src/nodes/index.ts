import type { Node } from "@xyflow/react"
import { z } from "zod"
import { type StepType, stepTypes } from "../steps/step-action"
import { addNotesNodeSchema } from "./add-notes"
import { type NodeType, nodeTypeSchema } from "./base"
import { conditionNodeSchema } from "./condition"
import { followUpNodeSchema } from "./follow-up"
import { landingPageNodeSchema } from "./landing-page"
import { performActionNodeSchema } from "./perform-action"
import { sendMailNodeSchema } from "./send-mail"
import { sendMessageNodeSchema } from "./send-message"
import { splitTrafficNodeSchema } from "./split-traffic"
import { startFlowNodeSchema } from "./start-flow"
import { waitNodeSchema } from "./wait"

export const flowVersionSchema = z.discriminatedUnion("type", [
  sendMessageNodeSchema,
  startFlowNodeSchema,
  performActionNodeSchema,
  conditionNodeSchema,
  splitTrafficNodeSchema,
  waitNodeSchema,
  followUpNodeSchema,
  addNotesNodeSchema,
  landingPageNodeSchema,
  sendMailNodeSchema,
])
export type FlowVersionSchema = z.infer<typeof flowVersionSchema>

export const edgeSchema = z.object({
  id: z.string().describe("Unique edge id."),
  source: z.string().describe("Id of the node the edge leaves."),
  sourceHandle: z
    .string()
    .describe(
      "Output handle on the source node. For the node-level Continue connection use the source node's own id; for a button, condition case, or other step output use that button/case/state id.",
    ),
  target: z.string().describe("Id of the node the edge enters."),
  targetHandle: z
    .string()
    .describe("Input handle on the target node: the target node's id."),
})
export type EdgeSchema = z.infer<typeof edgeSchema>

export type FlowNode = Node<FlowVersionSchema["data"]>

export const disabledContinueNodeTypes = [
  nodeTypeSchema.enum.splitTraffic,
  nodeTypeSchema.enum.condition,
] as NodeType[]

export const disabledContinueStepTypes = [
  stepTypes.enum.appointmentScheduling,
] as StepType[]

export const shouldShowDefaultContinue = (
  type: NodeType,
  data: FlowNode["data"],
) => {
  if (disabledContinueNodeTypes.includes(type)) {
    return false
  }

  if (!("steps" in data.details)) {
    return true
  }

  // Only the last step in the node falls through to the node-level Continue
  // edge when it doesn't branch (see flow.ts's step-array walk) — an earlier
  // step in the array always advances to the next step instead, regardless
  // of its own states.
  const lastStep = data.details.steps?.at(-1)
  return !(lastStep && disabledContinueStepTypes.includes(lastStep.stepType))
}
