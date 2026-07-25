import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const makeStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.make),
  events: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type MakeStepSchema = z.infer<typeof makeStepSchema>

export const makeStepDefaultFn = (): MakeStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.make,
  events: [],
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
