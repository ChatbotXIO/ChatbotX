import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const disableMessengerComposerStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.disableMessengerComposer),
})

export type DisableMessengerComposerStepSchema = z.infer<
  typeof disableMessengerComposerStepSchema
>

export const disableMessengerComposerStepDefaultFn = (
  props?: Partial<DisableMessengerComposerStepSchema>,
): DisableMessengerComposerStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.disableMessengerComposer,
  ...props,
})
