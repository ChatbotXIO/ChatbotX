import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const disableMessengerComposerStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.disableMessengerComposer)
    .describe('Step type discriminator: "disableMessengerComposer".'),
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
