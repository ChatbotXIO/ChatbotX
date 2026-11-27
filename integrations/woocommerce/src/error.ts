/**
 * A call WooCommerce refused. `unauthorized` means the REST API keys no
 * longer work (revoked, or the user behind them lost access), so the
 * connection should be marked invalid rather than retried. A 403 is a key
 * with read-only permission: it still reads, but cannot write.
 */
export class WooCommerceApiError extends Error {
  readonly statusCode: number
  /** WooCommerce's own error code, e.g. `woocommerce_rest_cannot_view`. */
  readonly code: string | null
  readonly retryAfterSeconds?: number
  readonly unauthorized: boolean

  constructor(props: {
    message: string
    statusCode: number
    code?: string | null
    retryAfterSeconds?: number
  }) {
    super(props.message)
    this.name = "WooCommerceApiError"
    this.statusCode = props.statusCode
    this.code = props.code ?? null
    this.retryAfterSeconds = props.retryAfterSeconds
    this.unauthorized = props.statusCode === 401
  }
}
