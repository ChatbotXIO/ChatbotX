import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const countCharactersStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.countCharacters),
  inputCfId: zodBigintAsString(),
  outputCfId: zodBigintAsString(),
})
export type CountCharactersStepSchema = z.infer<
  typeof countCharactersStepSchema
>

export const countCharactersStepDefaultFn = (
  props?: Partial<CountCharactersStepSchema>,
): CountCharactersStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.countCharacters,
  inputCfId: "",
  outputCfId: "",
  ...props,
})
