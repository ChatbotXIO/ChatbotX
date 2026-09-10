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

/** One JSON-path → custom-field row, matching External API Request mapping. */
export const javascriptJsonPathMappingSchema = z.object({
  jsonPath: z.string(),
  outputFieldId: z.string(),
})
export type JavascriptJsonPathMappingSchema = z.infer<
  typeof javascriptJsonPathMappingSchema
>

const hasCompleteJavascriptMapping = (
  mapping: JavascriptJsonPathMappingSchema[],
): boolean =>
  mapping.some(
    (entry) =>
      entry.jsonPath.trim().length > 0 && entry.outputFieldId.trim().length > 0,
  )

export const executeJavascriptStepSchema = z
  .object({
    id: zodBigintAsString(),
    stepType: z.literal(stepTypes.enum.executeJavascript),
    code: z.string().trim().min(1).max(MAX_CODE_LENGTH),
    // Optional dump of the whole return value. Individual fields are mapped
    // via `mapping`, the same JSON-path picker External API Request uses.
    customFieldId: z.string().trim(),
    mapping: z.array(javascriptJsonPathMappingSchema).default([]),
    states: z.tuple([successStateSchema, errorStateSchema]),
  })
  .superRefine((data, ctx) => {
    data.mapping.forEach((entry, index) => {
      const jsonPath = entry.jsonPath.trim()
      const outputFieldId = entry.outputFieldId.trim()
      if (jsonPath.length > 0 && outputFieldId.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["mapping", index, "outputFieldId"],
          message: "Output custom field is required",
        })
      }
      if (outputFieldId.length > 0 && jsonPath.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["mapping", index, "jsonPath"],
          message: "JSON path is required",
        })
      }
    })

    if (!(data.customFieldId || hasCompleteJavascriptMapping(data.mapping))) {
      ctx.addIssue({
        code: "custom",
        path: ["mapping"],
        message: "Map at least one JSON path, or choose an output custom field",
      })
    }
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
    mapping: [
      {
        jsonPath: "",
        outputFieldId: "",
      },
    ],
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  })
