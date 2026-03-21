import { type FilterMode, Operator } from "@chatbotx.io/flow-config"

type OperatorType = (typeof Operator)[keyof typeof Operator]

const compare = (a: string, b: string, operator: OperatorType): boolean => {
  const strA = String(a)
  const strB = String(b)

  switch (operator) {
    case Operator.IS:
      return String(a) === String(b)
    case Operator.IS_NOT:
      return String(a) !== String(b)
    case Operator.GTE:
      return Number(a) >= Number(b)
    case Operator.LTE:
      return Number(a) <= Number(b)
    case Operator.GT:
      return Number(a) > Number(b)
    case Operator.LT:
      return Number(a) < Number(b)
    case Operator.CONTAINS:
      return strA.includes(strB)
    case Operator.NOT_CONTAINS:
      return !strA.includes(strB)
    case Operator.STARTS_WITH:
      return strA.startsWith(strB)
    case Operator.ENDS_WITH:
      return strA.endsWith(strB)
    default:
      throw new Error(`Unknown operator: ${operator}`)
  }
}

export const isMatchedRow = (
  header: string[],
  rowValues: string[],
  lookup: {
    mode: FilterMode
    conditions: { value: string; column: string; operator: OperatorType }[]
  },
): boolean => {
  const results = lookup.conditions.map((cond) => {
    const colIndex = header.indexOf(cond.column)
    if (colIndex === -1) {
      return false
    }
    const cellValue = rowValues[colIndex]
    return compare(cellValue, cond.value, cond.operator)
  })

  return lookup.mode === "AND" ? results.every(Boolean) : results.some(Boolean)
}
