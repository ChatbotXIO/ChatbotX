import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const MAX_CODE_LENGTH = 10_000

export const executeJavascriptStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.executeJavascript),
  code: z.string().trim().min(1).max(MAX_CODE_LENGTH),
  customFieldId: z.string().trim().min(1),
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type ExecuteJavascriptStepSchema = z.infer<
  typeof executeJavascriptStepSchema
>

export const executeJavascriptStepDefaultFn =
  (): ExecuteJavascriptStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.executeJavascript,
    code: "",
    customFieldId: "",
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  })
