import { ChatbotXException } from "../errors"

const discountError = (
  message: string,
  code: string,
  data?: Record<string, string | number>,
  status?: number,
) => {
  const error = new ChatbotXException(message, code, status)
  if (data) {
    error.data = data
  }
  return error
}

export const discountCodeNotFoundException = () =>
  discountError(
    "This discount code does not exist.",
    "discountCodeNotFound",
    undefined,
    404,
  )

export const discountCodeInactiveException = () =>
  discountError("This discount code is turned off.", "discountCodeInactive")

export const discountCodeNotStartedException = (startsAt: Date) =>
  discountError(
    "This discount code is not valid yet.",
    "discountCodeNotStarted",
    {
      startsAt: startsAt.toISOString(),
    },
  )

export const discountCodeExpiredException = () =>
  discountError("This discount code has expired.", "discountCodeExpired")

export const discountCodeUsageLimitReachedException = () =>
  discountError(
    "This discount code has been used up.",
    "discountCodeUsageLimitReached",
  )

export const discountCodeAlreadyUsedException = () =>
  discountError(
    "This discount code can be used once per customer.",
    "discountCodeAlreadyUsed",
  )

export const discountCodeNotEligibleException = () =>
  discountError(
    "This discount code is not available to this customer.",
    "discountCodeNotEligible",
  )

export const discountCodeMinimumNotMetException = (input: {
  minimumType: "amount" | "quantity"
  minimum: number
  missing: number
}) =>
  discountError(
    input.minimumType === "amount"
      ? `This discount code needs a purchase of at least ${input.minimum}.`
      : `This discount code needs at least ${input.minimum} items.`,
    "discountCodeMinimumNotMet",
    input,
  )

export const discountCodeNotApplicableException = () =>
  discountError(
    "This discount code does not apply to anything in the order.",
    "discountCodeNotApplicable",
  )

export const discountCodeDuplicatedException = () =>
  discountError(
    "A discount code with this name already exists.",
    "discountCodeDuplicated",
    undefined,
    409,
  )
