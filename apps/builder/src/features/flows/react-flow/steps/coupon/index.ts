import {
  type CouponStepSchema,
  markCouponUsedStepDefaultFn,
  markCouponUsedStepSchema,
  setUpCouponStepDefaultFn,
  setUpCouponStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import { CouponActionEditor } from "./editor"
import { CouponActionViewer } from "./viewer"

export const setUpCouponStep: StepDefinition<CouponStepSchema> = {
  editor: CouponActionEditor,
  viewer: CouponActionViewer,
  validator: setUpCouponStepSchema,
  defaultFn: setUpCouponStepDefaultFn,
}

export const markCouponUsedStep: StepDefinition<CouponStepSchema> = {
  editor: CouponActionEditor,
  viewer: CouponActionViewer,
  validator: markCouponUsedStepSchema,
  defaultFn: markCouponUsedStepDefaultFn,
}

export const couponStepByType = {
  [stepTypes.enum.setUpCoupon]: setUpCouponStep,
  [stepTypes.enum.markCouponUsed]: markCouponUsedStep,
}
