import { createParser } from "nuqs/server"

export const parseAsBigInt = createParser({
  parse(queryValue) {
    try {
      return BigInt(queryValue).toString()
    } catch {
      return null // Or return a default BigInt(0)
    }
  },
  serialize(value) {
    return value.toString()
  },
})
