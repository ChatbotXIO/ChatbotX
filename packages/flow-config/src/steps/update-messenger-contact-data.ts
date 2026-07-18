import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const updateMessengerContactDataStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.updateMessengerContactData),
})

export type UpdateMessengerContactDataStepSchema = z.infer<
  typeof updateMessengerContactDataStepSchema
>

export const updateMessengerContactDataStepDefaultFn = (
  props?: Partial<UpdateMessengerContactDataStepSchema>,
): UpdateMessengerContactDataStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.updateMessengerContactData,
  ...props,
})
