import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const startExternalFlowStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.startExternalFlow),
  flowId: zodBigintAsString(),
})

export type StartExternalFlowStepSchema = z.infer<
  typeof startExternalFlowStepSchema
>

export const startExternalFlowStepDefaultFn = (
  props?: Partial<StartExternalFlowStepSchema>,
): StartExternalFlowStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.startExternalFlow,
  flowId: "",
  ...props,
})
