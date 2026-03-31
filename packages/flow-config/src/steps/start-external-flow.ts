import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const startExternalFlowStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.startExternalFlow),
  flowId: z.bigint(),
})

export type StartExternalFlowStepSchema = z.infer<
  typeof startExternalFlowStepSchema
>

export const startExternalFlowStepDefaultFn = (
  props?: Partial<StartExternalFlowStepSchema>,
): StartExternalFlowStepSchema => ({
  id: createId(),
  stepType: StepType.startExternalFlow,
  flowId: "",
  ...props,
})
