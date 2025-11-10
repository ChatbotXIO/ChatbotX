import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const countCharactersStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.countCharacters),
  inputCustomFieldId: z.cuid2(),
  outputCustomFieldId: z.cuid2(),
})
export type CountCharactersStepSchema = z.infer<
  typeof countCharactersStepSchema
>

export const countCharactersStepDefaultFn = (
  props?: Partial<CountCharactersStepSchema>,
): CountCharactersStepSchema => ({
  id: createId(),
  stepType: StepType.countCharacters,
  inputCustomFieldId: "",
  outputCustomFieldId: "",
  ...props,
})
