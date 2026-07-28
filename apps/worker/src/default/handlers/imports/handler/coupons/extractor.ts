import { cleanText } from "@chatbotx.io/imports/parsers"

const COUPON_HEADER = "coupon"
const COUPON_CODE_HEADER = "couponcode"
const CODE_HEADER = "code"
const MAX_CODE_LENGTH = 1000

export type CouponImportRow = {
  code: string
}

const normalizeHeader = (header: string) =>
  header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

export const findCouponColumn = (
  row: Record<string, unknown>,
): string | null => {
  for (const key of Object.keys(row)) {
    const normalized = normalizeHeader(key)
    if (
      normalized === COUPON_HEADER ||
      normalized === COUPON_CODE_HEADER ||
      normalized === CODE_HEADER
    ) {
      return key
    }
  }
  return null
}

export const extractCouponRow = (
  row: Record<string, unknown>,
): CouponImportRow | null => {
  const column = findCouponColumn(row)
  if (!column) {
    return null
  }

  const code = cleanText(row[column], MAX_CODE_LENGTH)
  return code ? { code } : null
}
