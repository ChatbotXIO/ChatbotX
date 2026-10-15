import { type MiniAppReference, parseReference } from "./references"

export class MiniAppExpressionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MiniAppExpressionError"
  }
}

export type Token =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "reference"; value: MiniAppReference }
  | { kind: "operator"; value: string }
  | { kind: "paren"; value: "(" | ")" }

const OPERATORS = ["==", "!=", ">=", "<=", "&&", "||", ">", "<", "!"]
const NUMBER_PATTERN = /^-?\d+(\.\d+)?/
const WORD_PATTERN = /^[A-Za-z_]+/
const WHITESPACE_PATTERN = /\s/

const readQuoted = (input: string, start: number): [string, number] => {
  const quote = input[start]
  let value = ""
  let index = start + 1
  while (index < input.length && input[index] !== quote) {
    if (input[index] === "\\" && index + 1 < input.length) {
      index++
    }
    value += input[index]
    index++
  }
  if (index >= input.length) {
    throw new MiniAppExpressionError("unterminated_string")
  }
  return [value, index + 1]
}

export const tokenize = (input: string): Token[] => {
  const tokens: Token[] = []
  let index = 0
  while (index < input.length) {
    const char = input[index] as string
    if (WHITESPACE_PATTERN.test(char)) {
      index++
      continue
    }
    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char })
      index++
      continue
    }
    if (char === "'" || char === '"') {
      const [value, next] = readQuoted(input, index)
      tokens.push({ kind: "string", value })
      index = next
      continue
    }
    if (char === "$" && input[index + 1] === "{") {
      const end = input.indexOf("}", index)
      if (end === -1) {
        throw new MiniAppExpressionError("unterminated_reference")
      }
      const reference = parseReference(input.slice(index + 2, end))
      if (!reference) {
        throw new MiniAppExpressionError("invalid_reference")
      }
      tokens.push({ kind: "reference", value: reference })
      index = end + 1
      continue
    }
    const rest = input.slice(index)
    const operator = OPERATORS.find((candidate) => rest.startsWith(candidate))
    const previous = tokens.at(-1)
    const numberMatch = NUMBER_PATTERN.exec(rest)
    // A leading "-" is a sign only where an operand is expected.
    const expectsOperand =
      !previous ||
      previous.kind === "operator" ||
      (previous.kind === "paren" && previous.value === "(")
    if (numberMatch && (char !== "-" || expectsOperand)) {
      tokens.push({ kind: "number", value: Number(numberMatch[0]) })
      index += numberMatch[0].length
      continue
    }
    if (operator) {
      tokens.push({ kind: "operator", value: operator })
      index += operator.length
      continue
    }
    const wordMatch = WORD_PATTERN.exec(rest)
    if (wordMatch && (wordMatch[0] === "true" || wordMatch[0] === "false")) {
      tokens.push({ kind: "boolean", value: wordMatch[0] === "true" })
      index += wordMatch[0].length
      continue
    }
    throw new MiniAppExpressionError("unexpected_token")
  }
  return tokens
}
