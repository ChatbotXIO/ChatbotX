import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const setUpCouponStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.setUpCoupon),
  topicId: zodBigintAsString(),
  states: z.preprocess(() => undefined, z.undefined()).optional(),
})
export type SetUpCouponStepSchema = z.infer<typeof setUpCouponStepSchema>

export const markCouponUsedStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.markCouponUsed),
  topicId: zodBigintAsString(),
  states: z.preprocess(() => undefined, z.undefined()).optional(),
})
export type MarkCouponUsedStepSchema = z.infer<typeof markCouponUsedStepSchema>

export type CouponStepSchema = SetUpCouponStepSchema | MarkCouponUsedStepSchema

export const setUpCouponStepDefaultFn = (): SetUpCouponStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.setUpCoupon,
  topicId: "",
})

export const markCouponUsedStepDefaultFn = (): MarkCouponUsedStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.markCouponUsed,
  topicId: "",
})
