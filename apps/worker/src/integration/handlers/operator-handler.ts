import { type FilterMode, Operator } from "@chatbotx.io/flow-config"

type OperatorType = (typeof Operator)[keyof typeof Operator]

const compare = (a: string, b: string, operator: OperatorType): boolean => {
  // Trim both sides so lookups are not broken by stray whitespace, e.g. a
  // trailing space left by the rich-text editor's serialization of a variable
  // token ("{{Phone}} ") or incidental spaces in a sheet cell.
  const strA = String(a).trim()
  const strB = String(b).trim()

  switch (operator) {
    case Operator.IS:
      return strA === strB
    case Operator.IS_NOT:
      return strA !== strB
    case Operator.GTE:
      return Number(strA) >= Number(strB)
    case Operator.LTE:
      return Number(strA) <= Number(strB)
    case Operator.GT:
      return Number(strA) > Number(strB)
    case Operator.LT:
      return Number(strA) < Number(strB)
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
