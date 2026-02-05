import type { BaseStateSchema } from "../states"
import type { StepType } from "./step-action"

export type BaseStepSchema = {
  id: string
  stepType: StepType
  states?: BaseStateSchema[]
}
