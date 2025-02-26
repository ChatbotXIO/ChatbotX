import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export enum GenerateType {
  NumericMinMaxLength = "NumberMinMaxLength",
  NumericMinMaxNumber = "NumericMinMaxNumber",
  AlphanumericMinMaxLength = "AlphanumericMinMaxLength",
}

export const generateRandomCodeSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.RandomCode),
  type: z.nativeEnum(GenerateType),
  min: z.coerce.number().int().min(0),
  max: z.coerce.number().int().min(0),
  customFieldId: z.string().cuid2(),
})
export type GenerateRandomCodeSchema = z.infer<typeof generateRandomCodeSchema>

export const generateRandomCodeDefaultValue = (): GenerateRandomCodeSchema => ({
  id: createId(),
  actionType: ActionType.RandomCode,
  type: GenerateType.NumericMinMaxLength,
  min: 0,
  max: 100,
  customFieldId: "",
})
