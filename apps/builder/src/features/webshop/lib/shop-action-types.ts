/**
 * Why a shop action did not go through, as a code the page translates. The
 * customer reads it, so it is never the server's English message.
 */
export type ShopActionError = {
  code: string
  field?: string
  data?: Record<string, unknown>
}

export type ShopActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ShopActionError }
