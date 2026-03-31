import { createParser } from "nuqs"

export const parseAsBigInt = createParser({
  parse(queryValue) {
    try {
      return BigInt(queryValue)
    } catch {
      return null // Or return a default BigInt(0)
    }
  },
  serialize(value) {
    return value.toString()
  },
})
