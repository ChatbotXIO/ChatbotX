/** Meta customer-file schema keys, in the order we always send them. */
export const CUSTOMER_FILE_KEYS = [
  "EMAIL",
  "PHONE",
  "FN",
  "LN",
  "CT",
  "ST",
  "ZIP",
  "COUNTRY",
  "DOBY",
  "DOBM",
  "DOBD",
  "GEN",
  "MADID",
] as const

export type CustomerFileKey = (typeof CUSTOMER_FILE_KEYS)[number]

/**
 * What a file column can map to. `DOB` is a full date that fans out into
 * DOBY/DOBM/DOBD; `DOBY` is a standalone year-of-birth column.
 */
export type CustomerFileColumn =
  | "EMAIL"
  | "PHONE"
  | "FN"
  | "LN"
  | "CT"
  | "ST"
  | "ZIP"
  | "COUNTRY"
  | "DOB"
  | "DOBY"
  | "GEN"
  | "MADID"
