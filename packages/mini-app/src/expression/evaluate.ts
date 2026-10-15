/**
 * A small, safe evaluator for the expressions Flow JSON allows in `If`
 * conditions, `Switch` values and text bindings:
 *
 *   ${form.age} >= 18 && (${form.plan} == 'pro' || !${form.trial})
 *
 * Supported: references (`${form.x}`, `${data.x}`, `${screen.ID.form.x}`,
 * `${screen.ID.data.x}`), number / quoted-string / boolean literals,
 * `== != > >= < <= && || !` and parentheses. Nothing is ever passed to `eval`.
 */

import { isNestedExpression, unwrapNestedExpression } from "./nested"
import { type ExpressionNode, parse } from "./parser"
import {
  MINI_APP_REFERENCE_PATTERN,
  type MiniAppRuntimeScope,
  parseReference,
  resolveReference,
} from "./references"
import { tokenize } from "./tokenizer"

export const isTruthy = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return Boolean(value)
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return value
  }
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    !Number.isNaN(Number(value))
  ) {
    return Number(value)
  }
  return
}

const looseEquals = (left: unknown, right: unknown): boolean => {
  const leftNumber = toNumber(left)
  const rightNumber = toNumber(right)
  if (leftNumber !== undefined && rightNumber !== undefined) {
    return leftNumber === rightNumber
  }
  if (typeof left === "boolean" || typeof right === "boolean") {
    return isTruthy(left) === isTruthy(right)
  }
  return String(left ?? "") === String(right ?? "")
}

const compare = (operator: string, left: unknown, right: unknown): boolean => {
  const leftNumber = toNumber(left)
  const rightNumber = toNumber(right)
  if (leftNumber === undefined || rightNumber === undefined) {
    return false
  }
  switch (operator) {
    case ">":
      return leftNumber > rightNumber
    case ">=":
      return leftNumber >= rightNumber
    case "<":
      return leftNumber < rightNumber
    default:
      return leftNumber <= rightNumber
  }
}

const evaluateNode = (
  node: ExpressionNode,
  scope: MiniAppRuntimeScope,
): unknown => {
  switch (node.kind) {
    case "literal":
      return node.value
    case "reference":
      return resolveReference(node.value, scope)
    case "not":
      return !isTruthy(evaluateNode(node.operand, scope))
    default: {
      if (node.operator === "&&") {
        return (
          isTruthy(evaluateNode(node.left, scope)) &&
          isTruthy(evaluateNode(node.right, scope))
        )
      }
      if (node.operator === "||") {
        return (
          isTruthy(evaluateNode(node.left, scope)) ||
          isTruthy(evaluateNode(node.right, scope))
        )
      }
      const left = evaluateNode(node.left, scope)
      const right = evaluateNode(node.right, scope)
      if (node.operator === "==") {
        return looseEquals(left, right)
      }
      if (node.operator === "!=") {
        return !looseEquals(left, right)
      }
      return compare(node.operator, left, right)
    }
  }
}

/** Throws `MiniAppExpressionError` when the expression cannot be parsed. */
export const assertValidExpression = (expression: string): void => {
  parse(tokenize(unwrapNestedExpression(expression)))
}

export const isValidExpression = (expression: string): boolean => {
  try {
    assertValidExpression(expression)
    return true
  } catch {
    return false
  }
}

/** Evaluates an expression; an unparseable expression evaluates to `undefined`. */
export const evaluateExpression = (
  expression: string | boolean,
  scope: MiniAppRuntimeScope,
): unknown => {
  if (typeof expression === "boolean") {
    return expression
  }
  try {
    return evaluateNode(
      parse(tokenize(unwrapNestedExpression(expression))),
      scope,
    )
  } catch {
    return
  }
}

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return ""
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(", ")
  }
  if (typeof value === "object") {
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * Renders a text property. Plain text gets each `${...}` replaced; a
 * backtick-wrapped nested expression (Flow JSON 6.0+) is concatenated from its
 * quoted strings and references, or evaluated when it contains operators.
 */
export const interpolate = (
  text: string,
  scope: MiniAppRuntimeScope,
): string => {
  if (isNestedExpression(text)) {
    try {
      const tokens = tokenize(unwrapNestedExpression(text))
      const isConcatenation = tokens.every(
        (token) =>
          token.kind === "string" ||
          token.kind === "reference" ||
          token.kind === "number",
      )
      if (isConcatenation) {
        return tokens
          .map((token) =>
            token.kind === "reference"
              ? formatValue(resolveReference(token.value, scope))
              : String(token.value),
          )
          .join("")
      }
      return formatValue(evaluateNode(parse(tokens), scope))
    } catch {
      return text
    }
  }
  return text.replace(MINI_APP_REFERENCE_PATTERN, (match, raw: string) => {
    const reference = parseReference(raw)
    return reference ? formatValue(resolveReference(reference, scope)) : match
  })
}
