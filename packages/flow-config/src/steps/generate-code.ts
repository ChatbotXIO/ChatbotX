import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const GenerateCodeType = {
  NUMERIC_LENGTH: "NUMERIC_LENGTH",
  NUMERIC_VALUE: "NUMERIC_VALUE",
  ALPHANUMERIC_LENGTH: "ALPHANUMERIC_LENGTH",
} as const

export const generateCodeStepSchema = z
  .object({
    id: z.cuid2(),
    stepType: z.literal(StepType.generateCode),
    type: z.enum(GenerateCodeType),
    min: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    max: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    outputCfId: z.cuid2(),
  })
  .refine((data) => data.min <= data.max, {
    message: "Max must be larger than Min",
    path: ["max"],
  })
export type GenerateCodeStepSchema = z.infer<typeof generateCodeStepSchema>

export const generateCodeStepDefaultFn = (): GenerateCodeStepSchema => ({
  id: createId(),
  stepType: StepType.generateCode,
  type: GenerateCodeType.NUMERIC_LENGTH,
  min: 0,
  max: 100,
  outputCfId: "",
})
