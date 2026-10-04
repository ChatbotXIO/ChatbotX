import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const triggerN8nStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.triggerN8n)
    .describe('Step type discriminator: "triggerN8n".'),
  events: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type TriggerN8nStepSchema = z.infer<typeof triggerN8nStepSchema>

export const triggerN8nStepDefaultFn = (): TriggerN8nStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.triggerN8n,
  events: [],
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
