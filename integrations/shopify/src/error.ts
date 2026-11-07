/**
 * A call Shopify refused. `unauthorized` means the token or secret no longer
 * works (revoked, app uninstalled), so the connection should be marked
 * invalid rather than retried. A 403 (`ACCESS_DENIED`: a missing scope or
 * protected customer data) is not: the token still works for everything else.
 */
export class ShopifyApiError extends Error {
  readonly statusCode: number
  readonly retryAfterSeconds?: number
  readonly unauthorized: boolean

  constructor(props: {
    message: string
    statusCode: number
    retryAfterSeconds?: number
  }) {
    super(props.message)
    this.name = "ShopifyApiError"
    this.statusCode = props.statusCode
    this.retryAfterSeconds = props.retryAfterSeconds
    this.unauthorized = props.statusCode === 401
  }
}

/** A mutation Shopify answered with `userErrors`. */
export class ShopifyUserError extends Error {
  readonly fieldErrors: Array<{ field: string[] | null; message: string }>

  constructor(errors: Array<{ field?: string[] | null; message: string }>) {
    super(errors.map((error) => error.message).join("; "))
    this.name = "ShopifyUserError"
    this.fieldErrors = errors.map((error) => ({
      field: error.field ?? null,
      message: error.message,
    }))
  }
}
