import type {
  DiscountAppliesTo,
  DiscountMinimumType,
  DiscountType,
  ShippingType,
} from "@chatbotx.io/database/partials"
import { percentOf, roundMoney, sumMoney } from "@chatbotx.io/utils/money"
import {
  discountCodeExpiredException,
  discountCodeInactiveException,
  discountCodeMinimumNotMetException,
  discountCodeNotApplicableException,
  discountCodeNotStartedException,
  discountCodeUsageLimitReachedException,
} from "./errors"

/** What a code needs from an order line to price itself. */
export type CouponLine = {
  productId: string | null
  /** The product's category and sub-category. */
  categoryIds: string[]
  /** After the product's and the vendor's discounts, before tax. */
  amount: number
  quantity: number
}

export type CouponRules = {
  discountType: DiscountType
  discountValue: number
  appliesTo: DiscountAppliesTo
  categoryId: string | null
  productIds: string[]
  minimumType: DiscountMinimumType
  minimumValue: number
}

export type CouponState = {
  isActive: boolean
  startsAt: Date
  endsAt: Date | null
  usageLimit: number | null
  usedCount: number
}

/** On, within its dates, and with a use left. */
export const assertCouponUsable = (code: CouponState, now: Date) => {
  if (!code.isActive) {
    throw discountCodeInactiveException()
  }
  if (code.startsAt > now) {
    throw discountCodeNotStartedException(code.startsAt)
  }
  if (code.endsAt && code.endsAt <= now) {
    throw discountCodeExpiredException()
  }
  if (code.usageLimit !== null && code.usedCount >= code.usageLimit) {
    throw discountCodeUsageLimitReachedException()
  }
}

/** The lines a code takes money off; free shipping is about the whole order. */
const eligibleLines = (rules: CouponRules, lines: CouponLine[]) => {
  if (
    rules.discountType === "freeShipping" ||
    rules.appliesTo === "entireOrder"
  ) {
    return lines
  }
  if (rules.appliesTo === "category") {
    const { categoryId } = rules
    return categoryId
      ? lines.filter((line) => line.categoryIds.includes(categoryId))
      : []
  }
  return lines.filter(
    (line) =>
      line.productId !== null && rules.productIds.includes(line.productId),
  )
}

/**
 * What the code takes off. The minimum is read on the lines it applies to;
 * a fixed amount never takes more than those lines are worth; free shipping
 * takes the delivery cost off a delivery order. Throws when the code does not
 * apply or its minimum is not met.
 */
export const computeCouponDiscount = (
  rules: CouponRules,
  order: {
    lines: CouponLine[]
    shippingType: ShippingType | null
    shippingTotal: number
    currency: string
  },
): number => {
  const lines = eligibleLines(rules, order.lines)
  if (lines.length === 0) {
    throw discountCodeNotApplicableException()
  }
  const amount = sumMoney(
    lines.map((line) => line.amount),
    order.currency,
  )
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0)

  if (rules.minimumType === "amount" && amount < rules.minimumValue) {
    throw discountCodeMinimumNotMetException({
      minimumType: "amount",
      minimum: rules.minimumValue,
      missing: roundMoney(rules.minimumValue - amount, order.currency),
    })
  }
  if (rules.minimumType === "quantity" && quantity < rules.minimumValue) {
    throw discountCodeMinimumNotMetException({
      minimumType: "quantity",
      minimum: rules.minimumValue,
      missing: rules.minimumValue - quantity,
    })
  }

  switch (rules.discountType) {
    case "percentage":
      return percentOf(amount, rules.discountValue, order.currency)
    case "fixedAmount":
      return roundMoney(Math.min(rules.discountValue, amount), order.currency)
    case "freeShipping":
      if (order.shippingType !== "delivery" || order.shippingTotal <= 0) {
        throw discountCodeNotApplicableException()
      }
      return order.shippingTotal
    default:
      throw discountCodeNotApplicableException()
  }
}
