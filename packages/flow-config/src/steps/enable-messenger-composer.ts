import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const enableMessengerComposerStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.enableMessengerComposer)
    .describe('Step type discriminator: "enableMessengerComposer".'),
})

export type EnableMessengerComposerStepSchema = z.infer<
  typeof enableMessengerComposerStepSchema
>

export const enableMessengerComposerStepDefaultFn = (
  props?: Partial<EnableMessengerComposerStepSchema>,
): EnableMessengerComposerStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.enableMessengerComposer,
  ...props,
})
