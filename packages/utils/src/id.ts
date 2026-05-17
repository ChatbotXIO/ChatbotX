import { Snowflake } from "uuniq"

const NumericSnowflakeIDs = new Snowflake({
  epoch: new Date("2026-03-31").toISOString(),
})

export const SymbolicSnowflakeIDs = new Snowflake({
  epoch: new Date("2026-03-31").toISOString(),
  format: "symbolic",
  place_id: 1,
})

export const createId = (): string => NumericSnowflakeIDs.generate()

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
