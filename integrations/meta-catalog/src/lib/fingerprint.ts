import { createHash } from "node:crypto"

const sortObject = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortObject)
  }
  if (typeof value !== "object" || value === null) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortObject(item)]),
  )
}

export const fingerprintMetaItem = (item: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(sortObject(item)))
    .digest("hex")
