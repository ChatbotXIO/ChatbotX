import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const countCharactersStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.countCharacters),
  inputCfId: z.bigint(),
  outputCfId: z.bigint(),
})
export type CountCharactersStepSchema = z.infer<
  typeof countCharactersStepSchema
>

export const countCharactersStepDefaultFn = (
  props?: Partial<CountCharactersStepSchema>,
): CountCharactersStepSchema => ({
  id: createId(),
  stepType: StepType.countCharacters,
  inputCfId: "",
  outputCfId: "",
  ...props,
})
