import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const chooseChannelStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.chooseChannel)
    .describe('Step type discriminator: "chooseChannel".'),
  channel: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Channel this message node targets, e.g. `omnichannel` (any channel) or a specific channel type such as `messenger`, `whatsapp`, `instagram`, `telegram`. Channel-specific steps are validated against it on publish.",
    ),
})

export type ChooseChannelStepSchema = z.infer<typeof chooseChannelStepSchema>

export const chooseChannelStepDefaultFn = (
  props?: Partial<ChooseChannelStepSchema>,
): ChooseChannelStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.chooseChannel,
  channel: "omnichannel",
  ...props,
})
