/**
 * Why a provider call failed, reduced to what the caller can act on:
 * - `credentialsRejected` — the keys are wrong or lack a permission;
 * - `unavailable` — the provider is down or did not answer (retry later);
 * - `amountUnsupported` — the amount or currency cannot be charged;
 * - `signatureInvalid` — a webhook was not signed by the provider;
 * - `invalidRequest` — anything else the provider refused.
 */
export type PaymentProviderErrorKind =
  | "credentialsRejected"
  | "unavailable"
  | "amountUnsupported"
  | "signatureInvalid"
  | "invalidRequest"

export class PaymentProviderError extends Error {
  readonly kind: PaymentProviderErrorKind
  /** The provider's own code (`amount_too_small`, `INSTRUMENT_DECLINED`…). */
  readonly providerCode: string | null

  constructor(
    kind: PaymentProviderErrorKind,
    message: string,
    options?: { providerCode?: string | null; cause?: unknown },
  ) {
    super(message, { cause: options?.cause })
    this.name = "PaymentProviderError"
    this.kind = kind
    this.providerCode = options?.providerCode ?? null
  }
}

export const isPaymentProviderError = (
  error: unknown,
): error is PaymentProviderError => error instanceof PaymentProviderError
