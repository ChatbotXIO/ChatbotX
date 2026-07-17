import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { addMilliseconds } from "date-fns"
import { z } from "zod"
import { stepTypes } from "./step-action"
import { delayUnitToMs, waitStepDelayUnits } from "./wait"

export const FOLLOW_UP_MAX_DELAY_DAYS = 366
const FOLLOW_UP_MAX_DELAY_MS = FOLLOW_UP_MAX_DELAY_DAYS * 86_400_000

export const followUpStepSchema = z
  .object({
    id: zodBigintAsString(),
    stepType: z.literal(stepTypes.enum.followUp),
    duration: z.coerce.number().int().min(1),
    unit: waitStepDelayUnits,
  })
  .superRefine((data, ctx) => {
    if (data.duration * delayUnitToMs(data.unit) > FOLLOW_UP_MAX_DELAY_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: `Follow-up delay cannot exceed ${FOLLOW_UP_MAX_DELAY_DAYS} days`,
      })
    }
  })

export type FollowUpStepSchema = z.infer<typeof followUpStepSchema>

export const followUpStepDefaultFn = (): FollowUpStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.followUp,
  duration: 1,
  unit: waitStepDelayUnits.enum.hours,
})

export const computeFollowUpTriggerAt = (step: FollowUpStepSchema): Date =>
  addMilliseconds(Date.now(), step.duration * delayUnitToMs(step.unit))
