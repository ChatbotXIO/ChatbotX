import { StepType } from "@ahachat.ai/flow-config"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export enum GenerateCodeType {
  NUMERIC_LENGTH = "NUMERIC_LENGTH",
  NUMERIC_VALUE = "NUMERIC_VALUE",
  ALPHANUMERIC_LENGTH = "ALPHANUMERIC_LENGTH",
}

export const generateCodeStepSchema = z
  .object({
    id: z.string().cuid2(),
    stepType: z.literal(StepType.GENERATE_CODE),
    type: z.nativeEnum(GenerateCodeType),
    min: z.coerce.number().int().min(0),
    max: z.coerce.number().int().min(0),
    outputCustomFieldId: z.string().cuid2(),
  })
  .refine((data) => data.min <= data.max, {
    message: "Max must be larger than Min",
    path: ["max"],
  })
export type GenerateCodeStepSchema = z.infer<typeof generateCodeStepSchema>

export const generateCodeStepDefaultFn = (): GenerateCodeStepSchema => ({
  id: createId(),
  stepType: StepType.GENERATE_CODE,
  type: GenerateCodeType.NUMERIC_LENGTH,
  min: 0,
  max: 100,
  outputCustomFieldId: "",
})
