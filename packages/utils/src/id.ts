import { Snowflake } from "uuniq"

const NumericSnowflakeIDs = new Snowflake({
  epoch: new Date("2004-02-01").toISOString(),
})

export const SymbolicSnowflakeIDs = new Snowflake({
  epoch: new Date("2004-02-01").toISOString(),
  format: "symbolic",
  place_id: 1,
})

export const createId = (): string => NumericSnowflakeIDs.generate()

export const resolveId = (id: string) => NumericSnowflakeIDs.resolve(id)

export const parseBigIntId = (
  id: string | undefined | null,
): string | undefined => {
  if (!id) {
    return
  }
  try {
    return BigInt(id).toString()
  } catch {
    return
  }
}

export const getIdFromParams = <
  T extends Record<string, string | undefined | null>,
>(
  params: T,
  fieldName: keyof T,
) => params[fieldName]

const NUMERIC_ID_REGEX = /^\d+$/
export const isNumericId = (value: string): boolean =>
  NUMERIC_ID_REGEX.test(value)

export const toBullMqSafeIdSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_")
