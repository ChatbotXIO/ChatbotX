import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const updateMessengerContactDataStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.updateMessengerContactData)
    .describe('Step type discriminator: "updateMessengerContactData".'),
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
