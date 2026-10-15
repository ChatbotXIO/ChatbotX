import type { MiniAppReference } from "./references"
import { MiniAppExpressionError, type Token } from "./tokenizer"

export type ExpressionNode =
  | { kind: "literal"; value: unknown }
  | { kind: "reference"; value: MiniAppReference }
  | { kind: "not"; operand: ExpressionNode }
  | {
      kind: "binary"
      operator: string
      left: ExpressionNode
      right: ExpressionNode
    }

const BINARY_LEVELS: readonly (readonly string[])[] = [
  ["||"],
  ["&&"],
  ["==", "!="],
  [">", ">=", "<", "<="],
]

export const parse = (tokens: Token[]): ExpressionNode => {
  let position = 0
  const peek = () => tokens[position]

  const parsePrimary = (): ExpressionNode => {
    const token = tokens[position++]
    if (!token) {
      throw new MiniAppExpressionError("unexpected_end")
    }
    switch (token.kind) {
      case "number":
      case "string":
      case "boolean":
        return { kind: "literal", value: token.value }
      case "reference":
        return { kind: "reference", value: token.value }
      case "paren": {
        if (token.value !== "(") {
          throw new MiniAppExpressionError("unexpected_token")
        }
        const inner = parseLevel(0)
        const closing = tokens[position++]
        if (closing?.kind !== "paren" || closing.value !== ")") {
          throw new MiniAppExpressionError("missing_parenthesis")
        }
        return inner
      }
      case "operator":
        if (token.value === "!") {
          return { kind: "not", operand: parsePrimary() }
        }
        throw new MiniAppExpressionError("unexpected_token")
      default:
        throw new MiniAppExpressionError("unexpected_token")
    }
  }

  const parseLevel = (level: number): ExpressionNode => {
    if (level >= BINARY_LEVELS.length) {
      return parsePrimary()
    }
    let left = parseLevel(level + 1)
    let token = peek()
    while (
      token?.kind === "operator" &&
      BINARY_LEVELS[level]?.includes(token.value)
    ) {
      position++
      const right = parseLevel(level + 1)
      left = { kind: "binary", operator: token.value, left, right }
      token = peek()
    }
    return left
  }

  const root = parseLevel(0)
  if (position !== tokens.length) {
    throw new MiniAppExpressionError("unexpected_token")
  }
  return root
}
