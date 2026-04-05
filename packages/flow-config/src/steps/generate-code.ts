import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const GenerateCodeType = {
  NUMERIC_LENGTH: "NUMERIC_LENGTH",
  NUMERIC_VALUE: "NUMERIC_VALUE",
  ALPHANUMERIC_LENGTH: "ALPHANUMERIC_LENGTH",
} as const

export const generateCodeStepSchema = z
  .object({
    id: zodBigintAsString(),
    stepType: z.literal(stepTypes.enum.generateCode),
    type: z.enum(GenerateCodeType),
    min: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    max: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    outputCfId: zodBigintAsString(),
  })
  .refine((data) => data.min <= data.max, {
    message: "Max must be larger than Min",
    path: ["max"],
  })
export type GenerateCodeStepSchema = z.infer<typeof generateCodeStepSchema>

export const generateCodeStepDefaultFn = (): GenerateCodeStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.generateCode,
  type: GenerateCodeType.NUMERIC_LENGTH,
  min: 0,
  max: 100,
  outputCfId: "",
})
