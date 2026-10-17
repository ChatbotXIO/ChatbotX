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

const legacyMappingValueByValue = {
  noul: "probabilityTrue",
  probability: "selectedProbability",
} as const

/**
 * Keeps persisted Flow JSON backwards compatible while ensuring every parsed
 * (and subsequently saved) step has the canonical output name.
 */
export const normalizeEvaluateDecisionMappingValue = (value: unknown) =>
  typeof value === "string" && value in legacyMappingValueByValue
    ? legacyMappingValueByValue[value as keyof typeof legacyMappingValueByValue]
    : value

const textFieldMappingSchema = z
  .object({
    customFieldId: zodBigintAsString(),
    customFieldType: z.enum(["longText", "shortText"]),
    questionKey: z.string().trim().min(1).max(80),
    value: z.literal("choice"),
  })
  .strict()

const numberFieldMappingSchema = z
  .object({
    customFieldId: zodBigintAsString(),
    customFieldType: z.literal("number"),
    questionKey: z.string().trim().min(1).max(80),
    value: z.enum([
      "confidence",
      "probabilityTrue",
      "score",
      "selectedProbability",
    ]),
  })
  .strict()

export const evaluateDecisionFieldMappingSchema = z.union([
  textFieldMappingSchema,
  numberFieldMappingSchema,
])
export type EvaluateDecisionFieldMapping = z.infer<
  typeof evaluateDecisionFieldMappingSchema
>

const evaluateDecisionStepObjectSchema = z
  .object({
    contextCustomFieldIds: z.array(zodBigintAsString()).min(1).max(8),
    fieldMappings: z
      .array(evaluateDecisionFieldMappingSchema)
      .max(60)
      .superRefine((mappings, ctx) => {
        const seen = new Set<string>()
        for (const [index, mapping] of mappings.entries()) {
          if (seen.has(mapping.customFieldId)) {
            ctx.addIssue({
              code: "custom",
              message:
                "A custom field can only be mapped once in an Evaluate Decision step",
              path: [index, "customFieldId"],
            })
          }
          seen.add(mapping.customFieldId)
        }
      }),
    id: zodBigintAsString(),
    profileId: zodBigintAsString(),
    states: z.tuple([successStateSchema, skipStateSchema, errorStateSchema]),
    stepType: z.literal(stepTypes.enum.evaluateDecision),
  })
  .strict()
  .superRefine((step, ctx) => {
    const contextIds = new Set<string>()
    for (const [index, id] of step.contextCustomFieldIds.entries()) {
      if (contextIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: "A context custom field can only be selected once",
          path: ["contextCustomFieldIds", index],
        })
      }
      contextIds.add(id)
    }
    for (const [index, mapping] of step.fieldMappings.entries()) {
      if (contextIds.has(mapping.customFieldId)) {
        ctx.addIssue({
          code: "custom",
          message:
            "A custom field cannot be both Decision context and an output destination",
          path: ["fieldMappings", index, "customFieldId"],
        })
      }
    }
  })

/** Normalizes the fields that have a canonical persisted representation. */
export const normalizeEvaluateDecisionStep = (raw: unknown): unknown => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw
  }
  const step = raw as Record<string, unknown>
  return {
    ...step,
    contextCustomFieldIds: step.contextCustomFieldIds ?? [],
  }
}

export const evaluateDecisionStepSchema = evaluateDecisionStepObjectSchema
export type EvaluateDecisionStepSchema = z.infer<
  typeof evaluateDecisionStepSchema
>

export const evaluateDecisionStepDefaultFn =
  (): EvaluateDecisionStepSchema => ({
    fieldMappings: [],
    contextCustomFieldIds: [],
    id: createId(),
    profileId: "",
    states: [
      successStateDefaultFn(),
      skipStateDefaultFn(),
      errorStateDefaultFn(),
    ],
    stepType: stepTypes.enum.evaluateDecision,
  })
