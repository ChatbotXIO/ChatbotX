const P = "facebookMarketingMessages.delivery.errors" as const

/**
 * Meta error codes a merchant will realistically see, grouped by what they
 * mean to the merchant. An unknown code returns `null` and the UI falls back
 * to Meta's raw message.
 */
const labelKeyByCode = {
  190: `${P}.grantInvalid`,
  2300000: `${P}.campaignInactive`,
  2300002: `${P}.campaignInactive`,
  2300003: `${P}.campaignInactive`,
  2300015: `${P}.budgetReached`,
  2300053: `${P}.budgetReached`,
  2300054: `${P}.dailyBudgetReached`,
  2300034: `${P}.optedOut`,
  2300035: `${P}.frequencyLimit`,
  2300036: `${P}.frequencyLimit`,
  2300042: `${P}.frequencyLimit`,
  2300043: `${P}.frequencyLimit`,
  2300044: `${P}.frequencyLimit`,
  2300052: `${P}.frequencyLimit`,
  2300038: `${P}.contentRejected`,
} as const satisfies Record<number, `${typeof P}.${string}`>

const labelKeyByMessage = {
  deliveryFailed: `${P}.deliveryFailed`,
  outcomeUnknown: `${P}.outcomeUnknown`,
} as const

export type ErrorLabelKey =
  | (typeof labelKeyByCode)[keyof typeof labelKeyByCode]
  | (typeof labelKeyByMessage)[keyof typeof labelKeyByMessage]

export function errorLabelKey(code: number | null): ErrorLabelKey | null {
  if (code === null) {
    return null
  }
  return (labelKeyByCode as Record<number, ErrorLabelKey>)[code] ?? null
}

/** Webhook failures carry no code; two known strings are written by ChatbotX itself. */
export function messageLabelKey(message: string): ErrorLabelKey | null {
  return (labelKeyByMessage as Record<string, ErrorLabelKey>)[message] ?? null
}
