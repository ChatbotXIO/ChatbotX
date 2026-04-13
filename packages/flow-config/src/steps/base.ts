import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import type { BaseStateSchema } from "../states"
import type { StepType } from "./step-action"

export const baseStepSchema = z.object({
  id: zodBigintAsString(),
  nodeId: z.string().optional(),
})

export type BaseStepSchema = {
  id: string
  stepType: StepType
  nodeId?: string
  states?: BaseStateSchema[]
}
