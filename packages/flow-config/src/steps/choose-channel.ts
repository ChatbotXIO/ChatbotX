import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const chooseChannelStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.chooseChannel),
  channel: z.string().trim().min(1),
})

export type ChooseChannelStepSchema = z.infer<typeof chooseChannelStepSchema>

export const chooseChannelStepDefaultFn = (
  props?: Partial<ChooseChannelStepSchema>,
): ChooseChannelStepSchema => ({
  id: createId(),
  stepType: StepType.chooseChannel,
  channel: "omnichannel",
  ...props,
})
