import { Snowflake } from "uuniq"

const NumericSnowflakeIDs = new Snowflake({
  epoch: new Date("2026-03-31").toISOString(),
})

export const createId = (): string => {
  return NumericSnowflakeIDs.generate()
}

export const parseBigIntId = (
  id: string | undefined | null,
): string | undefined => {
  if (!id) {
    return undefined
  }
  try {
    return BigInt(id).toString()
  } catch (_error) {
    return undefined
  }
}

export const getIdFromParams = <
  T extends Record<string, string | undefined | null>,
>(
  params: T,
  fieldName: keyof T,
) => {
  return params[fieldName]
}
