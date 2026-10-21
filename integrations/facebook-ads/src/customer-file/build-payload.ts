// node:crypto (sync) on purpose — 100k rows × 13 keys through async Web
// Crypto is far too slow. This module is only reachable through the
// `./customer-file` package export, never the package root, so the builder's
// edge/middleware graph never pulls it in (spec D25).
import { createHash } from "node:crypto"
import type { CustomerFileColumnMap } from "./header-map"
import { CUSTOMER_FILE_KEYS, type CustomerFileKey } from "./keys"
import {
  normalizeBirthYear,
  normalizeCity,
  normalizeCountry,
  normalizeCustomerPhone,
  normalizeEmail,
  normalizeGender,
  normalizeMadid,
  normalizeName,
  normalizeState,
  normalizeZip,
  parseDateOfBirth,
} from "./normalizers"

export type CustomerFilePayload = {
  schema: CustomerFileKey[]
  data: string[][]
  skipped: number
}

const sha256Hex = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex")

function keyIsPresent(key: CustomerFileKey, columns: CustomerFileColumnMap) {
  switch (key) {
    case "DOBY":
      return columns.has("DOB") || columns.has("DOBY")
    case "DOBM":
    case "DOBD":
      return columns.has("DOB")
    default:
      return columns.has(key)
  }
}

function normalizeRow(
  row: string[],
  columns: CustomerFileColumnMap,
  now: Date,
): Partial<Record<CustomerFileKey, string | null>> {
  const cell = (column: Parameters<CustomerFileColumnMap["get"]>[0]) => {
    const index = columns.get(column)
    return index === undefined ? "" : (row[index] ?? "").trim()
  }
  const country = normalizeCountry(cell("COUNTRY"))
  const dob = parseDateOfBirth(cell("DOB"), now)
  return {
    EMAIL: normalizeEmail(cell("EMAIL")),
    PHONE: normalizeCustomerPhone(cell("PHONE"), country),
    FN: normalizeName(cell("FN")),
    LN: normalizeName(cell("LN")),
    CT: normalizeCity(cell("CT")),
    ST: normalizeState(cell("ST")),
    ZIP: normalizeZip(cell("ZIP"), country),
    COUNTRY: country,
    DOBY: normalizeBirthYear(cell("DOBY"), now) ?? dob?.doby ?? null,
    DOBM: dob?.dobm ?? null,
    DOBD: dob?.dobd ?? null,
    GEN: normalizeGender(cell("GEN")),
    MADID: normalizeMadid(cell("MADID")),
  }
}

/**
 * Normalize + hash a whole file. The schema is the canonical key order
 * filtered to what the headers provide, identical for every batch (Meta
 * requires a constant schema within a session). Rows without a valid EMAIL or
 * PHONE are counted in `skipped` and not emitted.
 */
export function buildCustomerFilePayload(
  rows: string[][],
  columns: CustomerFileColumnMap,
  now: Date = new Date(),
): CustomerFilePayload {
  const schema = CUSTOMER_FILE_KEYS.filter((key) => keyIsPresent(key, columns))
  const data: string[][] = []
  let skipped = 0

  for (const row of rows) {
    const values = normalizeRow(row, columns, now)
    if (!(values.EMAIL || values.PHONE)) {
      skipped += 1
      continue
    }
    data.push(
      schema.map((key) => {
        const value = values[key]
        if (!value) {
          return ""
        }
        return key === "MADID" ? value : sha256Hex(value)
      }),
    )
  }

  return { schema, data, skipped }
}
