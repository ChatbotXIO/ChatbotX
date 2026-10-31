/**
 * The share expiry a request carries: absent keeps the current one
 * (`undefined`), `null` removes it, an ISO date-time sets it.
 */
export const parseShareExpiry = (
  value: string | null | undefined,
): Date | null | undefined => {
  if (value === undefined || value === null) {
    return value
  }
  return new Date(value)
}
