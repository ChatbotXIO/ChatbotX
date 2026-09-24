import { Snowflake } from "uuniq"

const SNOWFLAKE_EPOCH = new Date("2004-02-01").toISOString()
const DEFAULT_SNOWFLAKE_PLACE_ID = 0
const MAX_SNOWFLAKE_PLACE_ID = 15
const SYMBOLIC_ID_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const DECIMAL_INTEGER_REGEX = /^\d+$/

export const parseSnowflakePlaceId = (
  value: string | undefined,
  isProduction: boolean,
): number => {
  if (!value) {
    if (isProduction) {
      throw new Error("SNOWFLAKE_PLACE_ID must be set in production")
    }
    return DEFAULT_SNOWFLAKE_PLACE_ID
  }

  if (!DECIMAL_INTEGER_REGEX.test(value)) {
    throw new Error("SNOWFLAKE_PLACE_ID must be an integer from 0 to 15")
  }

  const placeId = Number(value)
  if (!Number.isSafeInteger(placeId) || placeId > MAX_SNOWFLAKE_PLACE_ID) {
    throw new Error("SNOWFLAKE_PLACE_ID must be an integer from 0 to 15")
  }

  return placeId
}

const getSnowflakePlaceId = (): number => {
  if (typeof process === "undefined") {
    return DEFAULT_SNOWFLAKE_PLACE_ID
  }

  return parseSnowflakePlaceId(
    process.env.SNOWFLAKE_PLACE_ID,
    process.env.NODE_ENV === "production",
  )
}

const NumericSnowflakeIDs = new Snowflake({
  epoch: SNOWFLAKE_EPOCH,
  place_id: getSnowflakePlaceId(),
})

const encodeSymbolicId = (id: string): string => {
  let value = BigInt(id)
  let encoded = ""
  const radix = BigInt(SYMBOLIC_ID_ALPHABET.length)

  while (value > 0) {
    const characterIndex = Number(value % radix)
    encoded = `${SYMBOLIC_ID_ALPHABET[characterIndex]}${encoded}`
    value /= radix
  }

  return encoded || SYMBOLIC_ID_ALPHABET[0]
}

export const SymbolicSnowflakeIDs = {
  generate: (): string => encodeSymbolicId(NumericSnowflakeIDs.generate()),
}

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
