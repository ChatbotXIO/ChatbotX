import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import type { BaseStateSchema } from "../states"
import type { StepType } from "./step-action"

export const baseStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  nodeId: z
    .string()
    .optional()
    .describe("Id of the node containing this step. Optional."),
})

export type BaseStepSchema = {
  id: string
  stepType: StepType
  nodeId?: string
  states?: BaseStateSchema[]
}
