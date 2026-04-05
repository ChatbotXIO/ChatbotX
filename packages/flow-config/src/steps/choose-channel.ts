import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const chooseChannelStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.chooseChannel),
  channel: z.string().trim().min(1),
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
