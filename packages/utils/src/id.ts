import { Snowflake } from "uuniq"

const NumericSnowflakeIDs = new Snowflake()

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
