import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  skipStateDefaultFn,
  skipStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

const decisionMappingValueSchema = z.enum([
  "choice",
  "score",
  "noul",
  "confidence",
  "probability",
])

export const evaluateDecisionFieldMappingSchema = z
  .object({
    customFieldId: zodBigintAsString(),
    customFieldType: z.enum(["longText", "number", "shortText"]),
    questionKey: z.string().trim().min(1).max(80),
    value: decisionMappingValueSchema,
  })
  .strict()
  .superRefine((mapping, ctx) => {
    const choiceValue = mapping.value === "choice"
    const numberValue = !choiceValue
    if (
      (choiceValue &&
        !["shortText", "longText"].includes(mapping.customFieldType)) ||
      (numberValue && mapping.customFieldType !== "number")
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Decision mapping value is incompatible with custom field type",
        path: ["customFieldType"],
      })
    }
  })
export type EvaluateDecisionFieldMapping = z.infer<
  typeof evaluateDecisionFieldMappingSchema
>

export const evaluateDecisionStepSchema = z
  .object({
    fieldMappings: z.array(evaluateDecisionFieldMappingSchema).max(60),
    id: zodBigintAsString(),
    input: z.literal("currentMessage"),
    profileId: zodBigintAsString(),
    states: z.tuple([successStateSchema, skipStateSchema, errorStateSchema]),
    stepType: z.literal(stepTypes.enum.evaluateDecision),
  })
  .strict()
export type EvaluateDecisionStepSchema = z.infer<
  typeof evaluateDecisionStepSchema
>

export const evaluateDecisionStepDefaultFn =
  (): EvaluateDecisionStepSchema => ({
    fieldMappings: [],
    id: createId(),
    input: "currentMessage",
    profileId: "",
    states: [
      successStateDefaultFn(),
      skipStateDefaultFn(),
      errorStateDefaultFn(),
    ],
    stepType: stepTypes.enum.evaluateDecision,
  })
