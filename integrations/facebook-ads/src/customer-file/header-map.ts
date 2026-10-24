import type { CustomerFileColumn } from "./keys"

export type CustomerFileColumnMap = Map<CustomerFileColumn, number>

export type HeaderMapResult =
  | { ok: true; columns: CustomerFileColumnMap }
  | { ok: false; reason: "noIdentifier" }

const HEADER_NOISE = /[\s_\-/]/g

/** Keys are headers lowercased with spaces, `_`, `-` and `/` removed. */
const HEADER_ALIASES: Record<string, CustomerFileColumn> = {
  email: "EMAIL",
  phone: "PHONE",
  phonenumber: "PHONE",
  fn: "FN",
  firstname: "FN",
  ln: "LN",
  lastname: "LN",
  ct: "CT",
  city: "CT",
  st: "ST",
  state: "ST",
  province: "ST",
  stateprovince: "ST",
  zip: "ZIP",
  zipcode: "ZIP",
  postalcode: "ZIP",
  zippostalcode: "ZIP",
  country: "COUNTRY",
  dob: "DOB",
  dateofbirth: "DOB",
  doby: "DOBY",
  yearofbirth: "DOBY",
  gen: "GEN",
  gender: "GEN",
  madid: "MADID",
  mobileadvertiserid: "MADID",
}

/** Unknown columns are ignored; for duplicates the first column wins. */
export function mapCustomerFileHeaders(headers: string[]): HeaderMapResult {
  const columns: CustomerFileColumnMap = new Map()
  headers.forEach((header, index) => {
    const column =
      HEADER_ALIASES[header.trim().toLowerCase().replace(HEADER_NOISE, "")]
    if (column && !columns.has(column)) {
      columns.set(column, index)
    }
  })
  if (!(columns.has("EMAIL") || columns.has("PHONE"))) {
    return { ok: false, reason: "noIdentifier" }
  }
  return { ok: true, columns }
}
