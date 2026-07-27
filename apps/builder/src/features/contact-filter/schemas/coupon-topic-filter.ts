import {
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { sampleStringSchema } from "./shared"

const VALUELESS_OPERATORS = [
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.used,
] as const satisfies readonly OperatorType[]

export const COUPON_TOPIC_OPERATORS = [
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.used,
  operatorTypes.enum.eq,
] as const satisfies readonly OperatorType[]

const isValuelessOperator = (operator: OperatorType): boolean =>
  (VALUELESS_OPERATORS as readonly OperatorType[]).includes(operator)

/**
 * Dynamic per-coupon-topic condition. Like custom fields, each workspace
 * coupon topic becomes its own filter field at runtime (picked directly in
 * the "add condition" field list), so it cannot be a `field` literal in the
 * static discriminated union. A single `field: "couponTopic"` branch carries
 * the runtime `topicId` instead.
 */
export const couponTopicConditionSchema = z
  .object({
    field: z.literal("couponTopic"),
    topicId: z.string().min(1),
    operator: operatorTypes,
    value: sampleStringSchema.optional(),
  })
  .superRefine((condition, ctx) => {
    if (
      !(COUPON_TOPIC_OPERATORS as readonly OperatorType[]).includes(
        condition.operator,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Operator is not supported for this field",
        path: ["operator"],
      })
      return
    }

    if (isValuelessOperator(condition.operator)) {
      return
    }

    if (typeof condition.value !== "string" || condition.value.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Operator requires a value",
        path: ["value"],
      })
    }
  })

export type CouponTopicCondition = z.infer<typeof couponTopicConditionSchema>
