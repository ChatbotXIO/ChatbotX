import type { OnlinePaymentProvider } from "@chatbotx.io/database/partials"
import { isPaymentProviderError } from "@chatbotx.io/payments"
import { ChatbotXException } from "../errors"

export const paymentProviderNotConnectedException = (
  provider: OnlinePaymentProvider,
) => {
  const error = new ChatbotXException(
    `Connect ${provider} in Settings → Integrations first.`,
    "paymentProviderNotConnected",
  )
  error.data = { provider }
  return error
}

/**
 * Orders still need the provider's account (waiting for their money, or paid
 * and still open): it cannot be disconnected or swapped for another yet.
 */
export const paymentProviderInUseException = (
  provider: OnlinePaymentProvider,
  count: number,
) => {
  const error = new ChatbotXException(
    `${count} open order(s) were paid with ${provider} or are waiting for it. Complete or cancel them first.`,
    "paymentProviderInUse",
    409,
  )
  error.data = { provider, count }
  return error
}

/** Stores are connected through the current platform Stripe account. */
export const stripePlatformAccountInUseException = (count: number) => {
  const error = new ChatbotXException(
    `${count} store(s) are connected through the current Stripe account. A key of another Stripe account would cut them off; disconnect them first.`,
    "stripePlatformAccountInUse",
    409,
  )
  error.data = { count }
  return error
}

export const stripePlatformNotConfiguredException = () =>
  new ChatbotXException(
    "Stripe Connect is not set up on this platform yet (secret key and Connect client id).",
    "stripePlatformNotConfigured",
  )

export const stripeAccountAlreadyConnectedException = () =>
  new ChatbotXException(
    "This Stripe account is already connected to another workspace.",
    "stripeAccountAlreadyConnected",
    409,
  )

/** What was pasted is not a Stripe secret (`sk_…`) or restricted (`rk_…`) key. */
export const stripeSecretKeyInvalidException = () =>
  new ChatbotXException(
    "Paste a Stripe secret key (sk_live_… or sk_test_…) or a restricted key (rk_…), not a publishable key (pk_…).",
    "stripeSecretKeyInvalid",
  )

export const paymentCurrencyUnsupportedException = (
  provider: OnlinePaymentProvider,
  currency: string,
) => {
  const error = new ChatbotXException(
    `${provider} does not take payments in ${currency}.`,
    "paymentCurrencyUnsupported",
  )
  error.data = { provider, currency }
  return error
}

export const paymentMethodUnavailableException = (method: string) => {
  const error = new ChatbotXException(
    `The store does not take ${method} payments.`,
    "paymentMethodUnavailable",
  )
  error.data = { method }
  return error
}

/**
 * A provider call that failed, as the caller's error: wrong keys are the
 * store's to fix (400), a provider that did not answer is worth retrying
 * (503), anything else the provider refused is 400 with its own message.
 */
export const toPaymentProviderException = (
  provider: OnlinePaymentProvider,
  error: unknown,
): ChatbotXException => {
  if (!isPaymentProviderError(error)) {
    return new ChatbotXException(
      `${provider} could not be reached.`,
      "paymentProviderUnavailable",
      503,
    )
  }
  const data = { provider, providerCode: error.providerCode ?? "" }
  const build = (message: string, code: string, status?: number) => {
    const exception = new ChatbotXException(message, code, status)
    exception.data = data
    return exception
  }
  switch (error.kind) {
    case "credentialsRejected":
      return build(
        `${provider} refused the credentials.`,
        "paymentProviderCredentialsRejected",
      )
    case "amountUnsupported":
      return build(error.message, "paymentAmountUnsupported")
    case "unavailable":
      return build(
        `${provider} is not answering right now. Try again in a moment.`,
        "paymentProviderUnavailable",
        503,
      )
    default:
      return build(error.message, "paymentProviderRejected")
  }
}

/** The provider's call, its failure as the caller's error (unavailable, rejected…). */
export const callPaymentProvider = async <T>(
  provider: OnlinePaymentProvider,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw isPaymentProviderError(error)
      ? toPaymentProviderException(provider, error)
      : error
  }
}

/** The store disconnected the provider (`paymentProviderNotConnectedException`). */
export const isPaymentProviderNotConnected = (error: unknown) =>
  error instanceof ChatbotXException &&
  error.code === "paymentProviderNotConnected"
