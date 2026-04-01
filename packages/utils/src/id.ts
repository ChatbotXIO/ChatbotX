import { Snowflake } from "uuniq"

const NumericSnowflakeIDs = new Snowflake({
  epoch: new Date("2026-03-31").toISOString(),
})

export const createId = () => {
  return BigInt(NumericSnowflakeIDs.generate())
}

export const parseBigIntId = (
  id: string | undefined | null,
): bigint | undefined => {
  if (!id) {
    return undefined
  }
  try {
    return BigInt(id)
  } catch (_error) {
    return undefined
  }
}

export const getIdFromParams = <T extends Record<string, string>>(
  params: T,
  fieldName: keyof T,
) => {
  const id = params[fieldName]
  if (!id) {
    return BigInt(0)
  }
  return parseBigIntId(id) ?? BigInt(0)
}
