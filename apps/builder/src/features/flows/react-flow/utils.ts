import lodashIsObject from "lodash.isobject"
import lodashReduce from "lodash.reduce"

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const getAllIds = (obj: any): string[] => {
  const ids = lodashReduce(
    obj,
    (result, value, key) => {
      if (key === "id" && value !== "") {
        result.push(value)
      } else if (lodashIsObject(value) || Array.isArray(value)) {
        result.push(...getAllIds(value))
      }
      return result
    },
    [] as string[],
  )

  return ids
}
