import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

// Keep in sync with MAX_CODE_LENGTH in packages/javascript-sandbox/src/contract.ts
const MAX_CODE_LENGTH = 10_000
const MAX_MAPPING_ENTRIES = 20

export const javascriptExecutionMappingSchema = z.object({
  jsonPath: z.string().trim(),
  outputFieldId: z.string().trim().min(1),
})
export type JavascriptExecutionMapping = z.infer<
  typeof javascriptExecutionMappingSchema
>

export const executeJavascriptStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.executeJavascript),
  code: z.string().trim().min(1).max(MAX_CODE_LENGTH),
  mapping: z.array(javascriptExecutionMappingSchema).max(MAX_MAPPING_ENTRIES),
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
    mapping: [{ jsonPath: "", outputFieldId: "" }],
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  })
