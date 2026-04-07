import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const countCharactersStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.countCharacters),
  inputFieldId: z.string().trim().min(1),
  outputFieldId: z.string().trim().min(1),
})
export type CountCharactersStepSchema = z.infer<
  typeof countCharactersStepSchema
>

export const countCharactersStepDefaultFn = (
  props?: Partial<CountCharactersStepSchema>,
): CountCharactersStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.countCharacters,
  inputFieldId: "",
  outputFieldId: "",
  ...props,
})
